import type {
  IProvider,
  ProviderConfig,
  ProviderMetadata,
  WebhookValidationResult,
  NormalizedWebhookResult,
  WatcherEvent,
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
    if (!this.metadata.capabilities.webhook) {
      return {
        valid: false,
        error: `Provider ${this.metadata.name} does not support webhooks`,
      };
    }

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
    if (!this.metadata.capabilities.polling) {
      throw new ProviderError(
        `Provider ${this.metadata.name} does not support polling`,
        this.metadata.name
      );
    }
    return [];
  }

  async shutdown(): Promise<void> {
    logger.debug(`Shutting down provider: ${this.metadata.name}`);
  }
}
