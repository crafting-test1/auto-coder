import type { Reactor } from '../../types/index.js';
import type { LinearComments } from './LinearComments.js';
import { logger } from '../../utils/logger.js';

export class LinearReactor implements Reactor {
  constructor(
    private readonly comments: LinearComments,
    private readonly issueId: string
  ) {}

  async getLastComment(): Promise<{ author: string; body: string } | null> {
    try {
      const comments = await this.comments.getComments(this.issueId);

      if (comments.length === 0) {
        return null;
      }

      // Get the last comment
      const lastComment = comments[comments.length - 1];

      if (!lastComment) {
        return null;
      }

      return {
        author: lastComment.user.name,
        body: lastComment.body,
      };
    } catch (error) {
      logger.error('Failed to get last comment from Linear', error);
      throw error;
    }
  }

  async postComment(comment: string): Promise<string> {
    try {
      const commentId = await this.comments.postComment(this.issueId, comment);
      return commentId;
    } catch (error) {
      logger.error('Failed to post comment to Linear', error);
      throw error;
    }
  }

  async updateComment(commentId: string, comment: string): Promise<void> {
    try {
      await this.comments.updateComment(commentId, comment);
    } catch (error) {
      logger.error('Failed to update comment on Linear', error);
      throw error;
    }
  }
}
