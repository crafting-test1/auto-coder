import { BaseProvider } from '../BaseProvider.js';
import type {
  ProviderConfig,
  ProviderMetadata,
  EventHandler,
  NormalizedEvent,
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
    merged?: boolean;
    assignees?: any[];
    labels?: any[];
    user?: { login: string; id: number };
    head?: { ref: string };
    base?: { ref: string };
  };
  comment?: {
    id: number;
    body?: string;
    html_url?: string;
    user?: { login: string; id: number };
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

    const options = config.options as {
      webhookSecret?: string;
      webhookSecretEnv?: string;
      webhookSecretFile?: string;
      repositories?: string[];
      events?: string[];
      initialLookbackHours?: number;
      maxItemsPerPoll?: number;
    } | undefined;

    // Resolve webhook secret if provided
    const webhookSecret = ConfigLoader.resolveSecret(
      options?.webhookSecret,
      options?.webhookSecretEnv,
      options?.webhookSecretFile
    );

    this.webhook = new GitHubWebhook(webhookSecret);
    modes.push('webhook');

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

    // Skip newly opened PRs - nothing to do yet
    if (event === 'pull_request' && payload.action === 'opened') {
      logger.debug(`Skipping newly opened PR #${resourceNumber} - nothing to do`);
      return;
    }

    // Skip PR synchronize events (commits pushed) - automated action, not user interaction
    // Bot should only respond to comments, reviews, or explicit requests, not code pushes
    if (event === 'pull_request' && payload.action === 'synchronize') {
      logger.debug(`Skipping PR #${resourceNumber} synchronize event - commits pushed by author`);
      return;
    }

    // Skip other automated PR actions that don't require bot attention
    if (event === 'pull_request' && [
      'edited',          // Title/description changed
      'labeled',         // Labels added/removed
      'unlabeled',
      'assigned',        // Assignees changed
      'unassigned',
      'locked',          // PR locked/unlocked
      'unlocked',
    ].includes(payload.action)) {
      logger.debug(`Skipping PR #${resourceNumber} ${payload.action} event - automated action`);
      return;
    }

    // Skip closed/merged items unless they're being reopened
    if (this.shouldSkipClosedItem(payload)) {
      logger.debug(`Skipping closed/merged ${resourceType} #${resourceNumber}`);
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

  private shouldSkipClosedItem(payload: GitHubWebhookPayload): boolean {
    // Allow reopened events through
    if (payload.action === 'reopened') {
      return false;
    }

    // Check if issue/PR is closed or merged
    const state = payload.issue?.state || payload.pull_request?.state;
    if (state === 'closed') {
      return true;
    }

    // For PRs, also check merged state
    if (payload.pull_request?.merged) {
      return true;
    }

    return false;
  }

  private shouldSkipClosedPolledItem(item: any): boolean {
    // Check if item is closed
    if (item.data.state === 'closed') {
      return true;
    }

    // For PRs, also check merged state
    if (item.type === 'pull_request' && item.data.merged) {
      return true;
    }

    return false;
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

      // Skip closed/merged items from polling
      if (this.shouldSkipClosedPolledItem(item)) {
        logger.debug(`Skipping closed/merged ${resourceType} #${resourceNumber} in ${repository}`);
        continue;
      }

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

  private normalizeEvent(payload: GitHubWebhookPayload, deliveryId: string): NormalizedEvent {
    let type = 'issue';
    let eventId = '';
    let number = 0;
    let title = '';
    let description = '';
    let url = '';
    let state = '';
    let author: string | undefined;
    let assignees: unknown[] | undefined;
    let labels: string[] | undefined;
    let branch: string | undefined;
    let mergeTo: string | undefined;
    let comment: { body: string; author: string; url?: string } | undefined;

    if (payload.pull_request) {
      type = 'pull_request';
      const pr = payload.pull_request;
      eventId = `github:${payload.repository.full_name}:${payload.action}:${pr.id}:${deliveryId}`;
      number = pr.number;
      title = pr.title;
      description = pr.body || '';
      url = pr.html_url;
      state = pr.state;
      author = pr.user?.login;
      assignees = pr.assignees && pr.assignees.length > 0 ? pr.assignees : undefined;
      labels = pr.labels?.map((l: any) => l.name);
      branch = pr.head?.ref;
      mergeTo = pr.base?.ref;
    } else if (payload.issue) {
      type = 'issue';
      const issue = payload.issue;
      eventId = `github:${payload.repository.full_name}:${payload.action}:${issue.id}:${deliveryId}`;
      number = issue.number;
      title = issue.title;
      description = issue.body || '';
      url = issue.html_url;
      state = issue.state;
      author = issue.user?.login;
      assignees = issue.assignees && issue.assignees.length > 0 ? issue.assignees : undefined;
      labels = issue.labels?.map((l: any) => l.name);

      // If this is a PR issue (from issue_comment event), mark it as pull_request type
      if (issue.pull_request) {
        type = 'pull_request';
      }
    }

    // Extract comment information if present (for issue_comment events)
    if (payload.comment) {
      const commentObj: { body: string; author: string; url?: string } = {
        body: payload.comment.body || '',
        author: payload.comment.user?.login || 'unknown',
      };
      if (payload.comment.html_url) {
        commentObj.url = payload.comment.html_url;
      }
      comment = commentObj;
      // Update eventId to include comment ID for uniqueness
      eventId = `github:${payload.repository.full_name}:${payload.action}:comment:${payload.comment.id}:${deliveryId}`;
    }

    // Build resource object with only defined optional properties
    const resource: NormalizedEvent['resource'] = {
      number,
      title,
      description,
      url,
      state,
      repository: payload.repository.full_name,
    };

    if (author) resource.author = author;
    if (assignees) resource.assignees = assignees;
    if (labels) resource.labels = labels;
    if (branch) resource.branch = branch;
    if (mergeTo) resource.mergeTo = mergeTo;
    if (comment) resource.comment = comment;

    return {
      id: eventId,
      provider: 'github',
      type,
      action: payload.action,
      resource,
      actor: {
        username: payload.sender?.login || 'unknown',
        id: payload.sender?.id || 0,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        deliveryId,
      },
      raw: payload,
    };
  }

  private normalizePolledEvent(item: any): NormalizedEvent {
    const data = item.data;
    const type = item.type;
    const eventId = `github:${item.repository}:poll:${data.number}:${Date.now()}`;

    // Build resource object with only defined optional properties
    const resource: NormalizedEvent['resource'] = {
      number: data.number,
      title: data.title,
      description: data.body || '',
      url: data.html_url,
      state: data.state,
      repository: item.repository,
    };

    const author = data.user?.login;
    const assignees = data.assignees && data.assignees.length > 0 ? data.assignees : undefined;
    const labels = data.labels?.map((l: any) => l.name);
    const branch = type === 'pull_request' && data.head ? data.head.ref : undefined;
    const mergeTo = type === 'pull_request' && data.base ? data.base.ref : undefined;

    if (author) resource.author = author;
    if (assignees) resource.assignees = assignees;
    if (labels) resource.labels = labels;
    if (branch) resource.branch = branch;
    if (mergeTo) resource.mergeTo = mergeTo;

    return {
      id: eventId,
      provider: 'github',
      type,
      action: 'poll',
      resource,
      actor: {
        username: data.user?.login || 'unknown',
        id: data.user?.id || 0,
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
