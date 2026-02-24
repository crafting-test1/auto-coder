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
      '🤖 Event processed by auto-coder watcher at {timestamp}';
  }

  setProviders(providers: Map<string, IProvider>): void {
    this.providers = providers;
  }

  async isDuplicate(event: WatcherEvent): Promise<boolean> {
    const provider = this.providers.get(event.provider);

    if (!provider || !provider.getLastComment) {
      logger.warn(
        `Provider ${event.provider} does not support comment-based deduplication`
      );
      return false;
    }

    if (!event.resource.repository) {
      logger.debug('Event has no repository, cannot check for duplicates');
      return false;
    }

    const resourceNumber = this.extractResourceNumber(event.resource.url);
    if (!resourceNumber) {
      logger.debug(
        `Could not extract resource number from URL: ${event.resource.url}`
      );
      return false;
    }

    try {
      const lastComment = await provider.getLastComment(
        event.resource.repository,
        event.type,
        resourceNumber
      );

      if (!lastComment) {
        logger.debug(`No comments found on ${event.type} #${resourceNumber}`);
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

    if (!provider || !provider.postComment) {
      logger.warn(
        `Provider ${event.provider} does not support posting comments`
      );
      return;
    }

    if (!event.resource.repository) {
      logger.debug('Event has no repository, cannot post comment');
      return;
    }

    const resourceNumber = this.extractResourceNumber(event.resource.url);
    if (!resourceNumber) {
      logger.debug(
        `Could not extract resource number from URL: ${event.resource.url}`
      );
      return;
    }

    try {
      const comment = this.commentTemplate.replace(
        '{timestamp}',
        new Date().toISOString()
      );

      await provider.postComment(
        event.resource.repository,
        event.type,
        resourceNumber,
        comment
      );

      logger.debug(
        `Posted comment to ${event.type} #${resourceNumber} in ${event.resource.repository}`
      );
    } catch (error) {
      logger.error('Error posting comment', error);
    }
  }

  private extractResourceNumber(url: string): number | null {
    const match = url.match(/\/(?:issues|pull)\/(\d+)/);
    if (!match || !match[1]) {
      return null;
    }
    return parseInt(match[1], 10);
  }

  shutdown(): void {
    this.providers.clear();
  }
}
