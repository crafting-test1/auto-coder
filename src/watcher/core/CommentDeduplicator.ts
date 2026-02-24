import type { DeduplicationConfig, WatcherEvent, IProvider } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class CommentDeduplicator {
  private readonly botUsername: string;
  private readonly commentTemplate: string;
  private providers: Map<string, IProvider> = new Map();

  constructor(config: DeduplicationConfig) {
    if (!config.botUsername) {
      throw new Error('botUsername is required for comment-based deduplication');
    }
    this.botUsername = config.botUsername;
    this.commentTemplate =
      config.commentTemplate ||
      'Agent is working on session {id}';
  }

  setProviders(providers: Map<string, IProvider>): void {
    this.providers = providers;
  }

  async isDuplicate(event: WatcherEvent): Promise<boolean> {
    const provider = this.providers.get(event.provider);

    if (!provider) {
      logger.warn(`Provider ${event.provider} not found`);
      return false;
    }

    try {
      const lastComment = await provider.getLastComment(event);

      if (!lastComment) {
        logger.debug(`No comments found for event ${event.id}`);
        return false;
      }

      const isDuplicate = lastComment.author === this.botUsername;

      if (isDuplicate) {
        logger.info(
          `Event ${event.id} is a duplicate (last comment by ${this.botUsername})`
        );
      }

      return isDuplicate;
    } catch (error) {
      logger.error('Error checking for duplicate via comments', error);
      return false;
    }
  }

  async markAsProcessed(event: WatcherEvent): Promise<void> {
    const provider = this.providers.get(event.provider);

    if (!provider) {
      logger.warn(`Provider ${event.provider} not found`);
      return;
    }

    try {
      const comment = this.commentTemplate.replace('{id}', event.id);

      await provider.postComment(event, comment);

      logger.debug(`Posted deduplication comment for event ${event.id}`);
    } catch (error) {
      logger.error('Error posting comment', error);
    }
  }

  shutdown(): void {
    this.providers.clear();
  }
}
