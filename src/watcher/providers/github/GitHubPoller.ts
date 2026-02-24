import type { WatcherEvent, Actor } from '../../types/index.js';
import { EventType, EventAction } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { withExponentialRetry } from '../../utils/retry.js';

interface GitHubPollerConfig {
  token: string;
  repositories: string[];
  events?: string[];
}

export class GitHubPoller {
  private lastPoll: Map<string, Date> = new Map();

  constructor(private readonly config: GitHubPollerConfig) {}

  async poll(): Promise<WatcherEvent[]> {
    const events: WatcherEvent[] = [];

    for (const repo of this.config.repositories) {
      try {
        const repoEvents = await this.pollRepository(repo);
        events.push(...repoEvents);
      } catch (error) {
        logger.error(`Failed to poll repository ${repo}`, error);
      }
    }

    return events;
  }

  private async pollRepository(repo: string): Promise<WatcherEvent[]> {
    const events: WatcherEvent[] = [];
    const since = this.lastPoll.get(repo);

    if (this.shouldPollEvent('issues')) {
      const issues = await this.fetchIssues(repo, since);
      events.push(...issues);
    }

    if (this.shouldPollEvent('pull_request')) {
      const prs = await this.fetchPullRequests(repo, since);
      events.push(...prs);
    }

    this.lastPoll.set(repo, new Date());

    return events;
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
  ): Promise<WatcherEvent[]> {
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
    const events: WatcherEvent[] = [];

    for (const issue of issues as Array<{
      id: number;
      number: number;
      title: string;
      body?: string;
      state: string;
      html_url: string;
      user: { id: number; login: string; avatar_url?: string };
      labels: Array<{ name: string }>;
      assignees: Array<{ id: number; login: string }>;
      created_at: string;
      updated_at: string;
      pull_request?: unknown;
    }>) {
      if (issue.pull_request) {
        continue;
      }

      const eventId = `github:${repo}:poll:${issue.id}:${Date.now()}`;

      const resource: import('../../types/index.js').ResourceInfo = {
        id: String(issue.id),
        type: EventType.ISSUE,
        title: issue.title,
        state: issue.state,
        url: issue.html_url,
        repository: repo,
        labels: issue.labels.map((l) => l.name),
        assignees: issue.assignees.map((a) => ({
          id: String(a.id),
          username: a.login,
        })),
        author: this.mapActor(issue.user),
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
      };

      if (issue.body) {
        resource.description = issue.body;
      }

      events.push({
        id: eventId,
        provider: 'github',
        type: EventType.ISSUE,
        action: EventAction.UPDATED,
        resource,
        actor: this.mapActor(issue.user),
        metadata: {
          timestamp: new Date(),
          polled: true,
          raw: issue,
        },
      });
    }

    return events;
  }

  private async fetchPullRequests(
    repo: string,
    since?: Date
  ): Promise<WatcherEvent[]> {
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
    const events: WatcherEvent[] = [];

    for (const pr of prs as Array<{
      id: number;
      number: number;
      title: string;
      body?: string;
      state: string;
      html_url: string;
      user: { id: number; login: string; avatar_url?: string };
      labels: Array<{ name: string }>;
      assignees: Array<{ id: number; login: string }>;
      created_at: string;
      updated_at: string;
      merged_at?: string;
    }>) {
      if (since && new Date(pr.updated_at) <= since) {
        continue;
      }

      const eventId = `github:${repo}:poll:${pr.id}:${Date.now()}`;

      const resource: import('../../types/index.js').ResourceInfo = {
        id: String(pr.id),
        type: EventType.PULL_REQUEST,
        title: pr.title,
        state: pr.merged_at ? 'merged' : pr.state,
        url: pr.html_url,
        repository: repo,
        labels: pr.labels.map((l) => l.name),
        assignees: pr.assignees.map((a) => ({
          id: String(a.id),
          username: a.login,
        })),
        author: this.mapActor(pr.user),
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
      };

      if (pr.body) {
        resource.description = pr.body;
      }

      events.push({
        id: eventId,
        provider: 'github',
        type: EventType.PULL_REQUEST,
        action: pr.merged_at ? EventAction.MERGED : EventAction.UPDATED,
        resource,
        actor: this.mapActor(pr.user),
        metadata: {
          timestamp: new Date(),
          polled: true,
          raw: pr,
        },
      });
    }

    return events;
  }

  private mapActor(user: {
    id: number;
    login: string;
    avatar_url?: string;
  }): Actor {
    const actor: Actor = {
      id: String(user.id),
      username: user.login,
    };

    if (user.avatar_url) {
      actor.avatarUrl = user.avatar_url;
    }

    return actor;
  }
}
