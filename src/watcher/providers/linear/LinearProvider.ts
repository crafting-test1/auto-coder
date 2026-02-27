import { BaseProvider } from '../BaseProvider.js';
import type {
  ProviderConfig,
  ProviderMetadata,
  EventHandler,
  NormalizedEvent,
} from '../../types/index.js';
import { ConfigLoader } from '../../core/ConfigLoader.js';
import { LinearWebhook } from './LinearWebhook.js';
import { LinearPoller } from './LinearPoller.js';
import { LinearComments } from './LinearComments.js';
import { LinearReactor } from './LinearReactor.js';
import { ProviderError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

interface LinearWebhookPayload {
  action: string;
  type: string;
  createdAt: string;
  data: {
    id: string;
    identifier: string;
    number: number;
    title: string;
    description?: string;
    url: string;
    state: {
      name: string;
    };
    team: {
      key: string;
      name: string;
    };
    assignee?: {
      name: string;
    };
    creator?: {
      name: string;
    };
    labels?: Array<{ name: string }>;
    updatedAt: string;
    createdAt: string;
  };
  updatedFrom?: {
    [key: string]: unknown;
  };
}

export class LinearProvider extends BaseProvider {
  private webhook: LinearWebhook | undefined;
  private poller: LinearPoller | undefined;
  private comments: LinearComments | undefined;
  private apiKey: string | undefined;
  private botUsernames: string[] = [];

  get metadata(): ProviderMetadata {
    return {
      name: 'linear',
      version: '1.0.0',
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    const modes: string[] = [];

    if (config.auth) {
      this.apiKey = ConfigLoader.resolveSecret(
        config.auth.token,
        config.auth.tokenEnv,
        config.auth.tokenFile
      );

      if (this.apiKey) {
        this.comments = new LinearComments(this.apiKey);
      }
    }

    const options = config.options as {
      webhookSecret?: string;
      webhookSecretEnv?: string;
      webhookSecretFile?: string;
      teams?: string[];
      initialLookbackHours?: number;
      maxItemsPerPoll?: number;
      botUsername?: string | string[];
    } | undefined;

    // Read bot username(s) for deduplication
    if (options?.botUsername) {
      this.botUsernames = Array.isArray(options.botUsername)
        ? options.botUsername
        : [options.botUsername];
      logger.debug(`Linear bot usernames configured: ${this.botUsernames.join(', ')}`);
    } else {
      logger.warn('Linear: No botUsername configured - deduplication will not work');
    }

    // Resolve webhook secret if provided
    const webhookSecret = ConfigLoader.resolveSecret(
      options?.webhookSecret,
      options?.webhookSecretEnv,
      options?.webhookSecretFile
    );

    this.webhook = new LinearWebhook(webhookSecret);
    modes.push('webhook');

    const hasPollingConfig = this.apiKey;

    if (hasPollingConfig) {
      const pollerConfig: {
        apiKey: string;
        teams?: string[];
        initialLookbackHours?: number;
        maxItemsPerPoll?: number;
      } = {
        apiKey: this.apiKey!,
      };

      if (options?.teams) {
        pollerConfig.teams = options.teams;
      }

      if (options?.initialLookbackHours !== undefined) {
        pollerConfig.initialLookbackHours = options.initialLookbackHours;
      }

      if (options?.maxItemsPerPoll !== undefined) {
        pollerConfig.maxItemsPerPoll = options.maxItemsPerPoll;
      }

      this.poller = new LinearPoller(pollerConfig);
      modes.push('polling');
    }

    logger.info(`Linear provider initialized with modes: ${modes.join(', ')}`);
  }

  async validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    _body: unknown,
    rawBody?: string | Buffer
  ): Promise<boolean> {
    if (!this.webhook) {
      return false;
    }

    const result = this.webhook.validate(headers, rawBody || '');
    return result.valid;
  }

  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    eventHandler: EventHandler
  ): Promise<void> {
    if (!this.webhook) {
      throw new ProviderError('Linear webhook not initialized', 'linear');
    }

    if (!this.comments) {
      throw new ProviderError(
        'Linear comments not initialized (API key required)',
        'linear'
      );
    }

    const { webhookId } = this.webhook.extractMetadata(headers);
    const payload = body as LinearWebhookPayload;

    logger.debug(`Processing Linear ${payload.type} event (${payload.action})`);

    // Only handle issue events for now
    if (payload.type !== 'Issue') {
      logger.debug(`Skipping non-issue event: ${payload.type}`);
      return;
    }

    const issueId = payload.data.id;

    // Skip completed/cancelled items unless they're being reopened
    if (this.shouldSkipClosedItem(payload)) {
      logger.debug(`Skipping completed/cancelled issue ${payload.data.identifier}`);
      return;
    }

    const reactor = new LinearReactor(this.comments, issueId, this.botUsernames);

    // Normalize Linear event for template rendering
    const normalizedEvent = this.normalizeEvent(payload, webhookId);

    await eventHandler(normalizedEvent, reactor);
  }

  private shouldSkipClosedItem(payload: LinearWebhookPayload): boolean {
    // Linear doesn't have a simple "closed" state
    // States can be: "Backlog", "Todo", "In Progress", "Done", "Cancelled", etc.
    // We skip "Done" and "Cancelled" states
    const stateName = payload.data.state.name.toLowerCase();

    // Skip if state is done or cancelled
    if (stateName === 'done' || stateName === 'cancelled' || stateName === 'canceled') {
      return true;
    }

    return false;
  }

  private shouldSkipClosedPolledItem(item: any): boolean {
    // Check if item state is done or cancelled
    const stateName = item.data.state.name.toLowerCase();

    if (stateName === 'done' || stateName === 'cancelled' || stateName === 'canceled') {
      return true;
    }

    return false;
  }

  async poll(eventHandler: EventHandler): Promise<void> {
    if (!this.poller) {
      throw new ProviderError('Linear poller not initialized', 'linear');
    }

    if (!this.comments) {
      throw new ProviderError(
        'Linear comments not initialized (API key required)',
        'linear'
      );
    }

    const items = await this.poller.poll();

    logger.debug(`Processing ${items.length} items from Linear poll`);

    for (const item of items) {
      const issueId = item.data.id;

      // Skip completed/cancelled items from polling
      if (this.shouldSkipClosedPolledItem(item)) {
        logger.debug(`Skipping completed/cancelled issue ${item.data.identifier}`);
        continue;
      }

      logger.debug(`Creating reactor for issue ${item.data.identifier}`);

      const reactor = new LinearReactor(this.comments, issueId, this.botUsernames);

      // Normalize Linear API response for template rendering
      const normalizedEvent = this.normalizePolledEvent(item);

      logger.debug(`Calling event handler for issue ${item.data.identifier}`);
      await eventHandler(normalizedEvent, reactor);
    }

    logger.debug(`Finished processing ${items.length} items from Linear poll`);
  }

  private normalizeEvent(payload: LinearWebhookPayload, webhookId: string): NormalizedEvent {
    const data = payload.data;
    const eventId = `linear:${data.team.key}:${payload.action}:${data.id}:${webhookId}`;

    // Build resource object with only defined optional properties
    const resource: NormalizedEvent['resource'] = {
      number: data.number,
      title: data.title,
      description: data.description || '',
      url: data.url,
      state: data.state.name,
      repository: data.team.key,
    };

    const author = data.creator?.name;
    const assignees = data.assignee ? [data.assignee] : undefined;
    const labels = data.labels?.map((l) => l.name);

    if (author) resource.author = author;
    if (assignees) resource.assignees = assignees;
    if (labels && labels.length > 0) resource.labels = labels;

    return {
      id: eventId,
      provider: 'linear',
      type: 'issue',
      action: payload.action,
      resource,
      actor: {
        username: data.creator?.name || 'unknown',
        id: data.id,
      },
      metadata: {
        timestamp: payload.createdAt,
      },
      raw: payload,
    };
  }

  private normalizePolledEvent(item: any): NormalizedEvent {
    const data = item.data;
    const eventId = `linear:${item.team}:poll:${data.number}:${Date.now()}`;

    // Build resource object with only defined optional properties
    const resource: NormalizedEvent['resource'] = {
      number: data.number,
      title: data.title,
      description: data.description || '',
      url: data.url,
      state: data.state.name,
      repository: data.team.key,
    };

    const author = data.creator?.name;
    const assignees = data.assignee ? [data.assignee] : undefined;
    const labels = data.labels?.nodes?.map((l: any) => l.name);

    if (author) resource.author = author;
    if (assignees) resource.assignees = assignees;
    if (labels && labels.length > 0) resource.labels = labels;

    return {
      id: eventId,
      provider: 'linear',
      type: 'issue',
      action: 'poll',
      resource,
      actor: {
        username: data.creator?.name || 'unknown',
        id: data.id,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        polled: true,
      },
      raw: data,
    };
  }

  async shutdown(): Promise<void> {
    await super.shutdown();
    this.webhook = undefined;
    this.poller = undefined;
    this.comments = undefined;
    this.apiKey = undefined;
  }
}
