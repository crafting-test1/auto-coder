import type {
  IProvider,
  ProviderConfig,
  ProviderMetadata,
  WebhookValidationResult,
  NormalizedWebhookResult,
  WatcherEvent,
  CommentInfo,
} from '../types/index.js';
import { ProviderError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export abstract class BaseProvider implements IProvider {
  protected config!: ProviderConfig;

  abstract get metadata(): ProviderMetadata;

  async initialize(config: ProviderConfig): Promise<void> {
    logger.debug(`Initializing provider: ${this.metadata.name}`);
    this.config = config;
  }

  async validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: string | Buffer
  ): Promise<WebhookValidationResult> {
    return { valid: true };
  }

  async normalizeWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown
  ): Promise<NormalizedWebhookResult> {
    throw new ProviderError(
      'normalizeWebhook not implemented',
      this.metadata.name
    );
  }

  async poll(): Promise<WatcherEvent[]> {
    return [];
  }

  async getLastComment(event: WatcherEvent): Promise<CommentInfo | null> {
    logger.warn(
      `Provider ${this.metadata.name} does not support comment-based operations`
    );
    return null;
  }

  async postComment(event: WatcherEvent, comment: string): Promise<void> {
    logger.warn(
      `Provider ${this.metadata.name} does not support posting comments`
    );
  }

  async shutdown(): Promise<void> {
    logger.debug(`Shutting down provider: ${this.metadata.name}`);
  }
}
