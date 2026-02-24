import { BaseProvider } from '../BaseProvider.js';
import type {
  ProviderConfig,
  ProviderMetadata,
  WebhookValidationResult,
  NormalizedWebhookResult,
  WatcherEvent,
  CommentInfo,
} from '../../types/index.js';
import { ConfigLoader } from '../../core/ConfigLoader.js';
import { GitHubWebhook } from './GitHubWebhook.js';
import { GitHubNormalizer } from './GitHubNormalizer.js';
import { GitHubPoller } from './GitHubPoller.js';
import { GitHubComments } from './GitHubComments.js';
import { ProviderError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export class GitHubProvider extends BaseProvider {
  private webhook: GitHubWebhook | undefined;
  private normalizer: GitHubNormalizer | undefined;
  private poller: GitHubPoller | undefined;
  private comments: GitHubComments | undefined;
  private token: string | undefined;

  get metadata(): ProviderMetadata {
    return {
      name: 'github',
      version: '1.0.0',
      capabilities: {
        webhook: true,
        polling: true,
      },
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    if (config.auth) {
      this.token = ConfigLoader.resolveSecret(
        config.auth.token,
        config.auth.tokenEnv,
        config.auth.tokenFile
      );

      if (this.token) {
        this.comments = new GitHubComments(this.token);
      }
    }

    if (config.mode === 'webhook' || config.mode === 'both') {
      const secret = ConfigLoader.resolveSecret(
        config.webhookSecret,
        config.webhookSecretEnv,
        config.webhookSecretFile
      );

      this.webhook = new GitHubWebhook(secret);
      this.normalizer = new GitHubNormalizer();
    }

    if (config.mode === 'polling' || config.mode === 'both') {
      if (!this.token) {
        throw new ProviderError(
          'GitHub token not found for polling mode',
          'github'
        );
      }

      const options = config.options as {
        repositories?: string[];
        events?: string[];
      } | undefined;

      if (!options?.repositories || options.repositories.length === 0) {
        throw new ProviderError(
          'GitHub polling mode requires at least one repository in options.repositories',
          'github'
        );
      }

      const pollerConfig: { token: string; repositories: string[]; events?: string[] } = {
        token: this.token,
        repositories: options.repositories,
      };

      if (options.events) {
        pollerConfig.events = options.events;
      }

      this.poller = new GitHubPoller(pollerConfig);
    }

    logger.info(`GitHub provider initialized (mode: ${config.mode})`);
  }

  async validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: string | Buffer
  ): Promise<WebhookValidationResult> {
    if (!this.webhook) {
      return {
        valid: false,
        error: 'GitHub webhook not initialized',
      };
    }

    if (!rawBody) {
      return {
        valid: false,
        error: 'Raw body required for signature verification',
      };
    }

    return this.webhook.validate(headers, rawBody);
  }

  async normalizeWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown
  ): Promise<NormalizedWebhookResult> {
    if (!this.webhook || !this.normalizer) {
      throw new ProviderError(
        'GitHub webhook components not initialized',
        'github'
      );
    }

    const { event, deliveryId } = this.webhook.extractMetadata(headers);
    const events = this.normalizer.normalize(event, body, deliveryId);

    return { events, deliveryId };
  }

  async poll(): Promise<WatcherEvent[]> {
    if (!this.poller) {
      throw new ProviderError(
        'GitHub poller not initialized',
        'github'
      );
    }

    return this.poller.poll();
  }

  async getLastComment(
    repository: string,
    resourceType: string,
    resourceNumber: number
  ): Promise<CommentInfo | null> {
    if (!this.comments) {
      throw new ProviderError(
        'GitHub comments not initialized (token required)',
        'github'
      );
    }

    return this.comments.getLastComment(repository, resourceType, resourceNumber);
  }

  async postComment(
    repository: string,
    resourceType: string,
    resourceNumber: number,
    comment: string
  ): Promise<void> {
    if (!this.comments) {
      throw new ProviderError(
        'GitHub comments not initialized (token required)',
        'github'
      );
    }

    return this.comments.postComment(repository, resourceType, resourceNumber, comment);
  }

  async shutdown(): Promise<void> {
    await super.shutdown();
    this.webhook = undefined;
    this.normalizer = undefined;
    this.poller = undefined;
    this.comments = undefined;
    this.token = undefined;
  }
}
