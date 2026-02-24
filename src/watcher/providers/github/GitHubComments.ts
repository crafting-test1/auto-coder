import type { CommentInfo, WatcherEvent } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { withExponentialRetry } from '../../utils/retry.js';

export class GitHubComments {
  constructor(private readonly token: string) {}

  async getLastComment(event: WatcherEvent): Promise<CommentInfo | null> {
    const { repository, resourceNumber } = this.extractResourceInfo(event);
    if (!repository || !resourceNumber) {
      return null;
    }

    const endpoint = this.getCommentsEndpoint(repository, event.type, resourceNumber);
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

  async postComment(event: WatcherEvent, comment: string): Promise<void> {
    const { repository, resourceNumber } = this.extractResourceInfo(event);
    if (!repository || !resourceNumber) {
      throw new Error(`Cannot extract resource info from event ${event.id}`);
    }

    const endpoint = this.getCommentsEndpoint(repository, event.type, resourceNumber);
    if (!endpoint) {
      throw new Error(`Unsupported resource type: ${event.type}`);
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
        `Posted comment to ${event.type} #${resourceNumber} in ${repository}`
      );
    });
  }

  private extractResourceInfo(event: WatcherEvent): {
    repository: string | null;
    resourceNumber: number | null;
  } {
    const repository = event.resource.repository || null;

    // Extract resource number from URL
    const match = event.resource.url.match(/\/(?:issues|pull)\/(\d+)/);
    const resourceNumber = match?.[1] ? parseInt(match[1], 10) : null;

    return { repository, resourceNumber };
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
