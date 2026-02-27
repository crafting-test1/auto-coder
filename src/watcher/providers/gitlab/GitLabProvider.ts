import { BaseProvider } from '../BaseProvider.js';
import type {
  ProviderConfig,
  ProviderMetadata,
  EventHandler,
  NormalizedEvent,
} from '../../types/index.js';
import { ConfigLoader } from '../../core/ConfigLoader.js';
import { GitLabWebhook } from './GitLabWebhook.js';
import { GitLabPoller } from './GitLabPoller.js';
import { GitLabComments } from './GitLabComments.js';
import { GitLabReactor } from './GitLabReactor.js';
import { ProviderError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

interface GitLabWebhookPayload {
  object_kind: string;
  event_type?: string;
  project: {
    path_with_namespace: string;
    id: number;
  };
  object_attributes: {
    id: number;
    iid: number;
    title: string;
    description?: string;
    url: string;
    state: string;
    action?: string;
    updated_at: string;
    source_branch?: string;
    target_branch?: string;
    assignees?: any[];
    labels?: any[];
  };
  user?: {
    username: string;
    id: number;
  };
  assignees?: any[];
  labels?: any[];
}

export class GitLabProvider extends BaseProvider {
  private webhook: GitLabWebhook | undefined;
  private poller: GitLabPoller | undefined;
  private comments: GitLabComments | undefined;
  private token: string | undefined;
  private baseUrl: string | undefined;

  get metadata(): ProviderMetadata {
    return {
      name: 'gitlab',
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
        const options = config.options as {
          baseUrl?: string;
        } | undefined;

        this.baseUrl = options?.baseUrl;
        this.comments = new GitLabComments(this.token, this.baseUrl);
      }
    }

    const options = config.options as {
      webhookToken?: string;
      webhookTokenEnv?: string;
      webhookTokenFile?: string;
      baseUrl?: string;
      projects?: string[];
      events?: string[];
      initialLookbackHours?: number;
      maxItemsPerPoll?: number;
    } | undefined;

    // Resolve webhook token if provided
    const webhookToken = ConfigLoader.resolveSecret(
      options?.webhookToken,
      options?.webhookTokenEnv,
      options?.webhookTokenFile
    );

    this.webhook = new GitLabWebhook(webhookToken);
    modes.push('webhook');

    const hasPollingConfig =
      this.token && options?.projects && options.projects.length > 0;

    if (hasPollingConfig) {
      const pollerConfig: {
        token: string;
        projects: string[];
        events?: string[];
        initialLookbackHours?: number;
        maxItemsPerPoll?: number;
        baseUrl?: string;
      } = {
        token: this.token!,
        projects: options!.projects!,
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

      if (this.baseUrl) {
        pollerConfig.baseUrl = this.baseUrl;
      }

      this.poller = new GitLabPoller(pollerConfig);
      modes.push('polling');
    }

    logger.info(`GitLab provider initialized with modes: ${modes.join(', ')}`);
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
      throw new ProviderError('GitLab webhook not initialized', 'gitlab');
    }

    if (!this.comments) {
      throw new ProviderError(
        'GitLab comments not initialized (token required)',
        'gitlab'
      );
    }

    const { event } = this.webhook.extractMetadata(headers);
    const payload = body as GitLabWebhookPayload;

    logger.debug(`Processing GitLab ${event} event`);

    // Determine resource type and number for reactor
    let resourceType: string;
    let resourceNumber: number;

    if (payload.object_kind === 'issue') {
      resourceType = 'issue';
      resourceNumber = payload.object_attributes.iid;
    } else if (payload.object_kind === 'merge_request') {
      resourceType = 'merge_request';
      resourceNumber = payload.object_attributes.iid;
    } else if (payload.object_kind === 'note') {
      // Note events are comments - these should be processed
      // Determine if it's on an issue or MR
      const notePayload = payload as any;
      if (notePayload.merge_request) {
        resourceType = 'merge_request';
        resourceNumber = notePayload.merge_request.iid;
      } else if (notePayload.issue) {
        resourceType = 'issue';
        resourceNumber = notePayload.issue.iid;
      } else {
        logger.debug(`Skipping note event - unable to determine resource type`);
        return;
      }
    } else {
      logger.debug(`Unsupported GitLab event type: ${payload.object_kind}`);
      return;
    }

    const projectId = payload.project.path_with_namespace;

    // Skip newly opened MRs - nothing to do yet
    if (resourceType === 'merge_request' && payload.object_attributes.action === 'open') {
      logger.debug(`Skipping newly opened MR !${resourceNumber} - nothing to do`);
      return;
    }

    // Skip MR update events (commits pushed, title/description changed) - automated action, not user interaction
    // Bot should only respond to comments (note events), approvals, or explicit requests
    // Note: GitLab uses generic 'update' action for all MR updates including commits
    if (resourceType === 'merge_request' && payload.object_attributes.action === 'update' && payload.object_kind !== 'note') {
      logger.debug(`Skipping MR !${resourceNumber} update event - automated action (commits/metadata)`);
      return;
    }

    // Skip closed/merged items unless they're being reopened
    if (this.shouldSkipClosedItem(payload)) {
      logger.debug(`Skipping closed/merged ${resourceType} !${resourceNumber}`);
      return;
    }

    const reactor = new GitLabReactor(
      this.comments,
      projectId,
      resourceType,
      resourceNumber
    );

    // Normalize GitLab event for template rendering
    const normalizedEvent = this.normalizeEvent(payload);

    await eventHandler(normalizedEvent, reactor);
  }

  private shouldSkipClosedItem(payload: GitLabWebhookPayload): boolean {
    // Allow reopen events through
    if (payload.object_attributes.action === 'reopen') {
      return false;
    }

    // Check if issue/MR is closed or merged
    const state = payload.object_attributes.state;
    if (state === 'closed') {
      return true;
    }

    return false;
  }

  private shouldSkipClosedPolledItem(item: any): boolean {
    // Check if item is closed
    if (item.data.state === 'closed') {
      return true;
    }

    return false;
  }

  async poll(eventHandler: EventHandler): Promise<void> {
    if (!this.poller) {
      throw new ProviderError('GitLab poller not initialized', 'gitlab');
    }

    if (!this.comments) {
      throw new ProviderError(
        'GitLab comments not initialized (token required)',
        'gitlab'
      );
    }

    const items = await this.poller.poll();

    logger.debug(`Processing ${items.length} items from GitLab poll`);

    for (const item of items) {
      const projectId = item.project;
      const resourceType = item.type === 'issue' ? 'issue' : 'merge_request';
      const resourceNumber = item.number;

      // Skip closed/merged items from polling
      if (this.shouldSkipClosedPolledItem(item)) {
        logger.debug(`Skipping closed/merged ${resourceType} !${resourceNumber} in ${projectId}`);
        continue;
      }

      logger.debug(`Creating reactor for ${resourceType} !${resourceNumber} in ${projectId}`);

      const reactor = new GitLabReactor(
        this.comments,
        projectId,
        resourceType,
        resourceNumber
      );

      // Normalize GitLab API response for template rendering
      const normalizedEvent = this.normalizePolledEvent(item);

      logger.debug(`Calling event handler for ${resourceType} !${resourceNumber}`);
      await eventHandler(normalizedEvent, reactor);
    }

    logger.debug(`Finished processing ${items.length} items from GitLab poll`);
  }

  private normalizeEvent(payload: GitLabWebhookPayload): NormalizedEvent {
    let type = 'issue';
    let eventId = '';
    const attrs = payload.object_attributes;
    const projectId = payload.project.path_with_namespace;

    if (payload.object_kind === 'merge_request') {
      type = 'merge_request';
      eventId = `gitlab:${projectId}:${attrs.action || 'update'}:${attrs.id}:${Date.now()}`;
    } else if (payload.object_kind === 'issue') {
      type = 'issue';
      eventId = `gitlab:${projectId}:${attrs.action || 'update'}:${attrs.id}:${Date.now()}`;
    }

    // Build resource object with only defined optional properties
    const resource: NormalizedEvent['resource'] = {
      number: attrs.iid,
      title: attrs.title,
      description: attrs.description || '',
      url: attrs.url,
      state: attrs.state,
      repository: projectId,
    };

    const author = payload.user?.username;
    const assignees = payload.assignees || attrs.assignees;
    const labels = payload.labels?.map((l: any) => l.title) || attrs.labels?.map((l: any) => l.title);
    const branch = attrs.source_branch;
    const mergeTo = attrs.target_branch;

    if (author) resource.author = author;
    if (assignees && assignees.length > 0) resource.assignees = assignees;
    if (labels && labels.length > 0) resource.labels = labels;
    if (branch) resource.branch = branch;
    if (mergeTo) resource.mergeTo = mergeTo;

    return {
      id: eventId,
      provider: 'gitlab',
      type,
      action: attrs.action || 'update',
      resource,
      actor: {
        username: payload.user?.username || 'unknown',
        id: payload.user?.id || 0,
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
      raw: payload,
    };
  }

  private normalizePolledEvent(item: any): NormalizedEvent {
    const data = item.data;
    const type = item.type;
    const eventId = `gitlab:${item.project}:poll:${data.iid}:${Date.now()}`;

    // Build resource object with only defined optional properties
    const resource: NormalizedEvent['resource'] = {
      number: data.iid,
      title: data.title,
      description: data.description || '',
      url: data.web_url,
      state: data.state,
      repository: item.project,
    };

    const author = data.author?.username;
    const assignees = data.assignees;
    const labels = data.labels?.map((l: string) => l);
    const branch = type === 'merge_request' && data.source_branch ? data.source_branch : undefined;
    const mergeTo = type === 'merge_request' && data.target_branch ? data.target_branch : undefined;

    if (author) resource.author = author;
    if (assignees && assignees.length > 0) resource.assignees = assignees;
    if (labels && labels.length > 0) resource.labels = labels;
    if (branch) resource.branch = branch;
    if (mergeTo) resource.mergeTo = mergeTo;

    return {
      id: eventId,
      provider: 'gitlab',
      type,
      action: 'poll',
      resource,
      actor: {
        username: data.author?.username || 'unknown',
        id: data.author?.id || 0,
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
