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

    // Early filtering: Check if this is a supported event type
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

    // Normalize event first to apply shared filtering logic
    const normalizedEvent = this.normalizeEvent(payload, deliveryId);

    // Apply shared filtering logic
    if (!this.shouldProcessEvent(normalizedEvent)) {
      return; // Event filtered out (already logged in shouldProcessEvent)
    }

    // Create reactor and process event
    const reactor = new GitHubReactor(
      this.comments,
      payload.repository.full_name,
      resourceType,
      resourceNumber
    );

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

  /**
   * Shared filtering logic for both webhook and polling events
   * Determines if a normalized event should be processed
   * @param event - The normalized event
   * @param hasRecentComments - For polled events, whether there are recent comments
   * @returns true if event should be processed, false to skip
   */
  private shouldProcessEvent(event: NormalizedEvent, hasRecentComments?: boolean): boolean {
    const { type, action, resource } = event;

    // 1. Skip newly opened PRs/issues - nothing to do yet
    if (action === 'opened') {
      logger.debug(`Skipping newly opened ${type} #${resource.number} - nothing to do`);
      return false;
    }

    // 2. Skip PR synchronize events (commits pushed) - automated action, not user interaction
    // For polling, this is represented by action='poll' without recent comments
    if (type === 'pull_request') {
      if (action === 'synchronize') {
        logger.debug(`Skipping PR #${resource.number} synchronize event - commits pushed by author`);
        return false;
      }

      // For polled events, skip if no recent human interaction
      if (action === 'poll' && hasRecentComments === false) {
        logger.debug(`Skipping polled PR #${resource.number} - only updated due to commits, no new comments`);
        return false;
      }
    }

    // 3. Skip other automated actions that don't require bot attention
    if (type === 'pull_request' && [
      'edited',          // Title/description changed
      'labeled',         // Labels added/removed
      'unlabeled',
      'assigned',        // Assignees changed
      'unassigned',
      'locked',          // PR locked/unlocked
      'unlocked',
    ].includes(action)) {
      logger.debug(`Skipping PR #${resource.number} ${action} event - automated action`);
      return false;
    }

    // 4. Skip closed/merged items unless they're being reopened
    if (resource.state === 'closed' && action !== 'reopened') {
      logger.debug(`Skipping closed/merged ${type} #${resource.number}`);
      return false;
    }

    // Event should be processed
    return true;
  }

  /**
   * Check if a PR has recent human interaction (comments, reviews)
   * This helps filter out PRs that were only updated due to commits
   */
  private async hasRecentHumanInteraction(repository: string, prNumber: number): Promise<boolean> {
    if (!this.comments) {
      return true; // If we can't check, assume there is interaction
    }

    try {
      // Check for recent comments (last 5 comments)
      const comments = await this.comments.listComments(repository, prNumber, 5);

      // If there are any comments, consider it as having interaction
      // The deduplication system will handle if the bot already commented
      if (comments.length > 0) {
        logger.debug(`PR #${prNumber} has ${comments.length} recent comment(s)`);
        return true;
      }

      logger.debug(`PR #${prNumber} has no recent comments`);
      return false;
    } catch (error) {
      logger.warn(`Failed to check comments for PR #${prNumber}`, error);
      // On error, assume there is interaction to avoid missing important events
      return true;
    }
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

      // For PRs, check if there are recent comments to distinguish
      // between commit updates (skip) vs human interaction (process)
      let hasRecentComments: boolean | undefined;
      if (resourceType === 'pull_request') {
        hasRecentComments = await this.hasRecentHumanInteraction(repository, resourceNumber);
      }

      // Normalize event first to apply shared filtering logic
      const normalizedEvent = this.normalizePolledEvent(item);

      // Apply shared filtering logic (same as webhooks)
      if (!this.shouldProcessEvent(normalizedEvent, hasRecentComments)) {
        continue; // Event filtered out (already logged in shouldProcessEvent)
      }

      logger.debug(`Creating reactor for ${resourceType} #${resourceNumber} in ${repository}`);

      const reactor = new GitHubReactor(
        this.comments,
        repository,
        resourceType,
        resourceNumber
      );

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
