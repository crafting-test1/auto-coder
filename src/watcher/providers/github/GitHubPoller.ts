import { logger } from '../../utils/logger.js';
import { withExponentialRetry } from '../../utils/retry.js';

interface GitHubPollerConfig {
  token: string;
  repositories: string[];
  events?: string[];
}

interface GitHubItem {
  repository: string;
  type: 'issue' | 'pull_request';
  number: number;
  data: unknown;
}

export class GitHubPoller {
  private lastPoll: Map<string, Date> = new Map();

  constructor(private readonly config: GitHubPollerConfig) {}

  async poll(): Promise<GitHubItem[]> {
    const items: GitHubItem[] = [];

    for (const repo of this.config.repositories) {
      try {
        const repoItems = await this.pollRepository(repo);
        items.push(...repoItems);
      } catch (error) {
        logger.error(`Failed to poll repository ${repo}`, error);
      }
    }

    return items;
  }

  private async pollRepository(repo: string): Promise<GitHubItem[]> {
    const items: GitHubItem[] = [];
    const since = this.lastPoll.get(repo);

    if (this.shouldPollEvent('issues')) {
      const issues = await this.fetchIssues(repo, since);
      items.push(...issues);
    }

    if (this.shouldPollEvent('pull_request')) {
      const prs = await this.fetchPullRequests(repo, since);
      items.push(...prs);
    }

    this.lastPoll.set(repo, new Date());

    return items;
  }

  private shouldPollEvent(eventType: string): boolean {
    if (!this.config.events || this.config.events.length === 0) {
      return true;
    }
    return this.config.events.includes(eventType);
  }

  private async fetchIssues(
    repo: string,
    since?: Date
  ): Promise<GitHubItem[]> {
    const url = new URL(`https://api.github.com/repos/${repo}/issues`);
    url.searchParams.set('state', 'all');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', '100');

    if (since) {
      url.searchParams.set('since', since.toISOString());
    }

    const issues = await withExponentialRetry(async () => {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'auto-coder-watcher',
        },
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw response;
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    });

    const items: GitHubItem[] = [];

    for (const issue of issues as Array<{
      id: number;
      number: number;
      pull_request?: unknown;
    }>) {
      if (issue.pull_request) {
        continue;
      }

      items.push({
        repository: repo,
        type: 'issue',
        number: issue.number,
        data: issue,
      });
    }

    return items;
  }

  private async fetchPullRequests(
    repo: string,
    since?: Date
  ): Promise<GitHubItem[]> {
    const url = new URL(`https://api.github.com/repos/${repo}/pulls`);
    url.searchParams.set('state', 'all');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', '100');

    const prs = await withExponentialRetry(async () => {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'auto-coder-watcher',
        },
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw response;
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    });

    const items: GitHubItem[] = [];

    for (const pr of prs as Array<{
      id: number;
      number: number;
      updated_at: string;
    }>) {
      if (since && new Date(pr.updated_at) <= since) {
        continue;
      }

      items.push({
        repository: repo,
        type: 'pull_request',
        number: pr.number,
        data: pr,
      });
    }

    return items;
  }
}
