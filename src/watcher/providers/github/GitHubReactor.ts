import type { Reactor } from '../../types/index.js';
import { GitHubComments } from './GitHubComments.js';
import { logger } from '../../utils/logger.js';

export class GitHubReactor implements Reactor {
  private comments: GitHubComments;
  private repository: string;
  private resourceType: string;
  private resourceNumber: number;

  constructor(
    comments: GitHubComments,
    repository: string,
    resourceType: string,
    resourceNumber: number
  ) {
    this.comments = comments;
    this.repository = repository;
    this.resourceType = resourceType;
    this.resourceNumber = resourceNumber;
  }

  async getLastComment(): Promise<{ author: string; body: string } | null> {
    try {
      const comment = await this.comments.getLastComment(
        this.repository,
        this.resourceType,
        this.resourceNumber
      );
      if (!comment) {
        return null;
      }
      return {
        author: comment.author,
        body: comment.body,
      };
    } catch (error) {
      logger.error('Failed to get last comment via reactor', error);
      return null;
    }
  }

  async postComment(comment: string): Promise<string> {
    try {
      await this.comments.postComment(
        this.repository,
        this.resourceType,
        this.resourceNumber,
        comment
      );
      logger.debug(
        `Posted comment to ${this.resourceType} #${this.resourceNumber} in ${this.repository}`
      );
      // GitHub doesn't return comment ID in our current implementation, so return empty string
      return '';
    } catch (error) {
      logger.error('Failed to post comment via reactor', error);
      throw error;
    }
  }

  async updateComment(commentId: string, comment: string): Promise<void> {
    logger.warn('updateComment not yet implemented for GitHub');
    // TODO: Implement comment update via GitHub API
  }
}
