import { BaseProvider } from '../BaseProvider.js';
import type {
  ProviderConfig,
  ProviderMetadata,
  EventHandler,
} from '../../types/index.js';
import { ConfigLoader } from '../../core/ConfigLoader.js';
import { GitHubWebhook } from './GitHubWebhook.js';
import { GitHubPoller } from './GitHubPoller.js';
import { GitHubComments } from './GitHubComments.js';
import { GitHubReactor } from './GitHubReactor.js';
import { ProviderError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

interface GitHubWebhookPayload {
  action: string;
  issue?: {
    id: number;
    number: number;
    title: string;
    body?: string;
    html_url: string;
    state: string;
    assignees?: any[];
    labels?: any[];
    user?: { login: string; id: number };
    pull_request?: unknown;
  };
  pull_request?: {
    id: number;
    number: number;
    title: string;
    body?: string;
    html_url: string;
    state: string;
    assignees?: any[];
    labels?: any[];
    user?: { login: string; id: number };
    head?: { ref: string };
    base?: { ref: string };
  };
  comment?: {
    id: number;
  };
  repository: {
    full_name: string;
  };
  sender: {
    id: number;
    login: string;
  };
}

export class GitHubProvider extends BaseProvider {
  private webhook: GitHubWebhook | undefined;
  private poller: GitHubPoller | undefined;
  private comments: GitHubComments | undefined;
  private token: string | undefined;

  get metadata(): ProviderMetadata {
    return {
      name: 'github',
      version: '1.0.0',
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    const modes: string[] = [];

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

    this.webhook = new GitHubWebhook();
    modes.push('webhook');

    const options = config.options as {
      repositories?: string[];
      events?: string[];
      initialLookbackHours?: number;
      maxItemsPerPoll?: number;
    } | undefined;

    const hasPollingConfig =
      this.token && options?.repositories && options.repositories.length > 0;

    if (hasPollingConfig) {
      const pollerConfig: {
        token: string;
        repositories: string[];
        events?: string[];
        initialLookbackHours?: number;
        maxItemsPerPoll?: number;
      } = {
        token: this.token!,
        repositories: options!.repositories!,
      };

      if (options!.events) {
        pollerConfig.events = options.events;
      }

      if (options!.initialLookbackHours !== undefined) {
        pollerConfig.initialLookbackHours = options.initialLookbackHours;
      }

      if (options!.maxItemsPerPoll !== undefined) {
        pollerConfig.maxItemsPerPoll = options.maxItemsPerPoll;
      }

      this.poller = new GitHubPoller(pollerConfig);
      modes.push('polling');
    }

    logger.info(`GitHub provider initialized with modes: ${modes.join(', ')}`);
  }

  async validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
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
      throw new ProviderError('GitHub webhook not initialized', 'github');
    }

    if (!this.comments) {
      throw new ProviderError(
        'GitHub comments not initialized (token required)',
        'github'
      );
    }

    const { event, deliveryId } = this.webhook.extractMetadata(headers);
    const payload = body as GitHubWebhookPayload;

    logger.debug(`Processing GitHub ${event} event (delivery: ${deliveryId})`);

    // Determine resource type and number for reactor
    let resourceType: string;
    let resourceNumber: number;

    if (event === 'issues' && payload.issue) {
      resourceType = 'issue';
      resourceNumber = payload.issue.number;
    } else if (event === 'pull_request' && payload.pull_request) {
      resourceType = 'pull_request';
      resourceNumber = payload.pull_request.number;
    } else if (event === 'issue_comment' && payload.issue) {
      resourceType = payload.issue.pull_request ? 'pull_request' : 'issue';
      resourceNumber = payload.issue.number;
    } else {
      logger.debug(`Unsupported GitHub event type: ${event}`);
      return;
    }

    const reactor = new GitHubReactor(
      this.comments,
      payload.repository.full_name,
      resourceType,
      resourceNumber
    );

    // Normalize GitHub event for template rendering
    const normalizedEvent = this.normalizeEvent(payload, deliveryId);

    await eventHandler(normalizedEvent, reactor);
  }

  async poll(eventHandler: EventHandler): Promise<void> {
    if (!this.poller) {
      throw new ProviderError('GitHub poller not initialized', 'github');
    }

    if (!this.comments) {
      throw new ProviderError(
        'GitHub comments not initialized (token required)',
        'github'
      );
    }

    const items = await this.poller.poll();

    logger.debug(`Processing ${items.length} items from GitHub poll`);

    for (const item of items) {
      const repository = item.repository;
      const resourceType = item.type === 'issue' ? 'issue' : 'pull_request';
      const resourceNumber = item.number;

      logger.debug(`Creating reactor for ${resourceType} #${resourceNumber} in ${repository}`);

      const reactor = new GitHubReactor(
        this.comments,
        repository,
        resourceType,
        resourceNumber
      );

      // Normalize GitHub API response for template rendering
      const normalizedEvent = this.normalizePolledEvent(item);

      logger.debug(`Calling event handler for ${resourceType} #${resourceNumber}`);
      await eventHandler(normalizedEvent, reactor);
    }

    logger.debug(`Finished processing ${items.length} items from GitHub poll`);
  }

  private normalizeEvent(payload: GitHubWebhookPayload, deliveryId: string): unknown {
    let type = 'issue';
    let resource: any = {};
    let eventId = '';

    if (payload.pull_request) {
      type = 'pull_request';
      const pr = payload.pull_request;
      eventId = `github:${payload.repository.full_name}:${payload.action}:${pr.id}:${deliveryId}`;
      resource = {
        number: pr.number,
        title: pr.title,
        description: pr.body || '',
        url: pr.html_url,
        state: pr.state,
        repository: payload.repository.full_name,
        assignees: pr.assignees && pr.assignees.length > 0 ? pr.assignees : undefined,
        labels: pr.labels?.map((l: any) => l.name),
        author: pr.user?.login,
        branch: pr.head?.ref,
        mergeTo: pr.base?.ref,
      };
    } else if (payload.issue) {
      type = 'issue';
      const issue = payload.issue;
      eventId = `github:${payload.repository.full_name}:${payload.action}:${issue.id}:${deliveryId}`;
      resource = {
        number: issue.number,
        title: issue.title,
        description: issue.body || '',
        url: issue.html_url,
        state: issue.state,
        repository: payload.repository.full_name,
        assignees: issue.assignees && issue.assignees.length > 0 ? issue.assignees : undefined,
        labels: issue.labels?.map((l: any) => l.name),
        author: issue.user?.login,
      };
    }

    return {
      id: eventId,
      provider: 'github',
      type,
      action: payload.action,
      resource,
      actor: {
        username: payload.sender?.login,
        id: payload.sender?.id,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        deliveryId,
      },
      raw: payload,
    };
  }

  private normalizePolledEvent(item: any): unknown {
    const data = item.data;
    const type = item.type;
    const eventId = `github:${item.repository}:poll:${data.number}:${Date.now()}`;

    const resource: any = {
      number: data.number,
      title: data.title,
      description: data.body || '',
      url: data.html_url,
      state: data.state,
      repository: item.repository,
      assignees: data.assignees && data.assignees.length > 0 ? data.assignees : undefined,
      labels: data.labels?.map((l: any) => l.name),
      author: data.user?.login,
    };

    if (type === 'pull_request' && data.head) {
      resource.branch = data.head.ref;
      resource.mergeTo = data.base?.ref;
    }

    return {
      id: eventId,
      provider: 'github',
      type,
      action: 'poll',
      resource,
      actor: {
        username: data.user?.login,
        id: data.user?.id,
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
    this.token = undefined;
  }
}
