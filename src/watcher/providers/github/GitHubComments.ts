import { logger } from '../../utils/logger.js';
import { withExponentialRetry } from '../../utils/retry.js';

export interface CommentInfo {
  author: string;
  body: string;
  createdAt: Date;
}

export class GitHubComments {
  constructor(private readonly token: string) {}

  async getLastComment(
    repository: string,
    resourceType: string,
    resourceNumber: number
  ): Promise<CommentInfo | null> {
    const endpoint = this.getCommentsEndpoint(repository, resourceType, resourceNumber);
    if (!endpoint) {
      return null;
    }

    try {
      return await withExponentialRetry(async () => {
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'auto-coder-watcher',
          },
        });

        if (!response.ok) {
          if (response.status === 409) {
            throw response;
          }
          logger.warn(
            `GitHub API error getting comments: ${response.status} ${response.statusText}`
          );
          return null;
        }

        const comments = (await response.json()) as Array<{
          user: { login: string };
          body: string;
          created_at: string;
        }>;

        if (comments.length === 0) {
          return null;
        }

        const lastComment = comments[comments.length - 1];

        if (!lastComment) {
          return null;
        }

        return {
          author: lastComment.user.login,
          body: lastComment.body,
          createdAt: new Date(lastComment.created_at),
        };
      });
    } catch (error) {
      logger.error('Error fetching GitHub comments', error);
      return null;
    }
  }

  /**
   * List recent comments on an issue or PR
   * @param repository - Repository in format "owner/repo"
   * @param resourceNumber - Issue or PR number
   * @param limit - Maximum number of comments to fetch
   * @returns Array of recent comments
   */
  async listComments(
    repository: string,
    resourceNumber: number,
    limit: number = 10
  ): Promise<CommentInfo[]> {
    const endpoint = `https://api.github.com/repos/${repository}/issues/${resourceNumber}/comments?per_page=${limit}&sort=created&direction=desc`;

    try {
      return await withExponentialRetry(async () => {
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'auto-coder-watcher',
          },
        });

        if (!response.ok) {
          if (response.status === 409) {
            throw response;
          }
          logger.warn(
            `GitHub API error listing comments: ${response.status} ${response.statusText}`
          );
          return [];
        }

        const comments = (await response.json()) as Array<{
          user: { login: string };
          body: string;
          created_at: string;
        }>;

        return comments.map((c) => ({
          author: c.user.login,
          body: c.body,
          createdAt: new Date(c.created_at),
        }));
      });
    } catch (error) {
      logger.error('Error listing GitHub comments', error);
      return [];
    }
  }

  async postComment(
    repository: string,
    resourceType: string,
    resourceNumber: number,
    comment: string
  ): Promise<void> {
    const endpoint = this.getCommentsEndpoint(repository, resourceType, resourceNumber);
    if (!endpoint) {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    await withExponentialRetry(async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'auto-coder-watcher',
        },
        body: JSON.stringify({ body: comment }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw response;
        }
        const errorText = await response.text();
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}: ${errorText}`
        );
      }

      logger.debug(
        `Posted comment to ${resourceType} #${resourceNumber} in ${repository}`
      );
    });
  }

  private getCommentsEndpoint(
    repository: string,
    resourceType: string,
    resourceNumber: number
  ): string | null {
    const baseUrl = 'https://api.github.com';

    switch (resourceType) {
      case 'issue':
        return `${baseUrl}/repos/${repository}/issues/${resourceNumber}/comments`;
      case 'pull_request':
        return `${baseUrl}/repos/${repository}/issues/${resourceNumber}/comments`;
      default:
        logger.warn(`Unsupported resource type for comments: ${resourceType}`);
        return null;
    }
  }
}
