import {
  EventType,
  EventAction,
  type WatcherEvent,
  type Actor,
  type ResourceInfo,
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: string;
  html_url: string;
  user: { id: number; login: string; avatar_url?: string };
  labels?: Array<{ name: string }>;
  assignees?: Array<{ id: number; login: string }>;
  created_at?: string;
  updated_at?: string;
  pull_request?: unknown;
}

interface GitHubPullRequest extends GitHubIssue {
  merged?: boolean;
  merged_at?: string;
}

interface GitHubComment {
  id: number;
  body: string;
  html_url: string;
  user: { id: number; login: string; avatar_url?: string };
  created_at?: string;
  updated_at?: string;
}

interface GitHubRepository {
  full_name: string;
}

interface GitHubWebhookPayload {
  action: string;
  issue?: GitHubIssue;
  pull_request?: GitHubPullRequest;
  comment?: GitHubComment;
  repository: GitHubRepository;
  sender: { id: number; login: string; avatar_url?: string };
}

export class GitHubNormalizer {
  normalize(
    event: string,
    payload: unknown,
    deliveryId: string
  ): WatcherEvent[] {
    const webhookPayload = payload as GitHubWebhookPayload;
    const events: WatcherEvent[] = [];

    switch (event) {
      case 'issues':
        if (webhookPayload.issue) {
          events.push(this.normalizeIssue(webhookPayload, deliveryId));
        }
        break;

      case 'pull_request':
        if (webhookPayload.pull_request) {
          events.push(this.normalizePullRequest(webhookPayload, deliveryId));
        }
        break;

      case 'issue_comment':
        if (webhookPayload.comment) {
          events.push(this.normalizeComment(webhookPayload, deliveryId));
        }
        break;

      default:
        logger.debug(`Unsupported GitHub event type: ${event}`);
    }

    return events;
  }

  private normalizeIssue(
    payload: GitHubWebhookPayload,
    deliveryId: string
  ): WatcherEvent {
    const issue = payload.issue!;
    const action = this.mapAction(payload.action);

    const eventId = `github:${payload.repository.full_name}:${action}:${issue.id}:${deliveryId}`;

    return {
      id: eventId,
      provider: 'github',
      type: EventType.ISSUE,
      action,
      resource: this.mapIssueResource(issue, payload.repository),
      actor: this.mapActor(payload.sender),
      metadata: {
        deliveryId,
        timestamp: new Date(),
        raw: payload,
      },
    };
  }

  private normalizePullRequest(
    payload: GitHubWebhookPayload,
    deliveryId: string
  ): WatcherEvent {
    const pr = payload.pull_request!;
    let action = this.mapAction(payload.action);

    if (payload.action === 'closed' && pr.merged) {
      action = EventAction.MERGED;
    }

    const eventId = `github:${payload.repository.full_name}:${action}:${pr.id}:${deliveryId}`;

    return {
      id: eventId,
      provider: 'github',
      type: EventType.PULL_REQUEST,
      action,
      resource: this.mapPullRequestResource(pr, payload.repository),
      actor: this.mapActor(payload.sender),
      metadata: {
        deliveryId,
        timestamp: new Date(),
        raw: payload,
      },
    };
  }

  private normalizeComment(
    payload: GitHubWebhookPayload,
    deliveryId: string
  ): WatcherEvent {
    const comment = payload.comment!;
    const action = this.mapAction(payload.action);

    const resourceType = payload.issue?.pull_request
      ? EventType.PULL_REQUEST
      : EventType.ISSUE;
    const resourceId = payload.issue?.id || 0;

    const eventId = `github:${payload.repository.full_name}:comment:${comment.id}:${deliveryId}`;

    const resource: ResourceInfo = {
      id: String(comment.id),
      type: resourceType,
      title: `Comment on ${resourceType} #${payload.issue?.number}`,
      description: comment.body,
      url: comment.html_url,
      repository: payload.repository.full_name,
    };

    if (comment.updated_at) {
      resource.updatedAt = new Date(comment.updated_at);
    }

    return {
      id: eventId,
      provider: 'github',
      type: EventType.COMMENT,
      action,
      resource,
      actor: this.mapActor(payload.sender),
      metadata: {
        deliveryId,
        timestamp: new Date(),
        parentResourceId: String(resourceId),
        raw: payload,
      },
    };
  }

  private mapIssueResource(
    issue: GitHubIssue,
    repository: GitHubRepository
  ): ResourceInfo {
    const resource: ResourceInfo = {
      id: String(issue.id),
      type: EventType.ISSUE,
      title: issue.title,
      url: issue.html_url,
    };

    if (issue.body) {
      resource.description = issue.body;
    }

    if (issue.state) {
      resource.state = issue.state;
    }

    resource.repository = repository.full_name;

    if (issue.labels) {
      resource.labels = issue.labels.map((l) => l.name);
    }

    if (issue.assignees) {
      resource.assignees = issue.assignees.map((a) => ({
        id: String(a.id),
        username: a.login,
      }));
    }

    resource.author = this.mapActor(issue.user);

    if (issue.created_at) {
      resource.createdAt = new Date(issue.created_at);
    }

    if (issue.updated_at) {
      resource.updatedAt = new Date(issue.updated_at);
    }

    return resource;
  }

  private mapPullRequestResource(
    pr: GitHubPullRequest,
    repository: GitHubRepository
  ): ResourceInfo {
    const resource: ResourceInfo = {
      id: String(pr.id),
      type: EventType.PULL_REQUEST,
      title: pr.title,
      url: pr.html_url,
    };

    if (pr.body) {
      resource.description = pr.body;
    }

    resource.state = pr.merged ? 'merged' : pr.state;
    resource.repository = repository.full_name;

    if (pr.labels) {
      resource.labels = pr.labels.map((l) => l.name);
    }

    if (pr.assignees) {
      resource.assignees = pr.assignees.map((a) => ({
        id: String(a.id),
        username: a.login,
      }));
    }

    resource.author = this.mapActor(pr.user);

    if (pr.created_at) {
      resource.createdAt = new Date(pr.created_at);
    }

    if (pr.updated_at) {
      resource.updatedAt = new Date(pr.updated_at);
    }

    return resource;
  }

  private mapActor(user: {
    id: number;
    login: string;
    avatar_url?: string;
  }): Actor {
    const actor: Actor = {
      id: String(user.id),
      username: user.login,
    };

    if (user.avatar_url) {
      actor.avatarUrl = user.avatar_url;
    }

    return actor;
  }

  private mapAction(githubAction: string): EventAction {
    switch (githubAction) {
      case 'opened':
        return EventAction.CREATED;
      case 'edited':
      case 'synchronize':
        return EventAction.UPDATED;
      case 'closed':
        return EventAction.CLOSED;
      case 'reopened':
        return EventAction.REOPENED;
      case 'deleted':
        return EventAction.DELETED;
      case 'assigned':
        return EventAction.ASSIGNED;
      case 'unassigned':
        return EventAction.UNASSIGNED;
      case 'labeled':
        return EventAction.LABELED;
      case 'unlabeled':
        return EventAction.UNLABELED;
      case 'created':
        return EventAction.CREATED;
      default:
        logger.warn(`Unknown GitHub action: ${githubAction}, mapping to UPDATED`);
        return EventAction.UPDATED;
    }
  }
}
