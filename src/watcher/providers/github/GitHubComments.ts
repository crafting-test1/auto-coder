import type { CommentInfo } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

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
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'auto-coder-watcher',
        },
      });

      if (!response.ok) {
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
    } catch (error) {
      logger.error('Error fetching GitHub comments', error);
      return null;
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

    try {
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
        const errorText = await response.text();
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}: ${errorText}`
        );
      }

      logger.debug(
        `Posted comment to ${resourceType} #${resourceNumber} in ${repository}`
      );
    } catch (error) {
      logger.error('Error posting GitHub comment', error);
      throw error;
    }
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
