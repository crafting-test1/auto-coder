import type { NormalizedEvent } from '../../types/index.js';

export interface LinearWebhookPayload {
  action: string;
  type: string;
  createdAt: string;
  url?: string;
  organizationId?: string;
  webhookTimestamp?: number;
  actor?: {
    id: string;
    type: string;
    name: string;
    email?: string;
    url?: string;
  };
  data: {
    id: string;
    identifier: string;
    number: number;
    title: string;
    description?: string;
    url: string;
    state: {
      name: string;
      type?: string;
      color?: string;
    };
    team: {
      key: string;
      name: string;
    };
    assignee?: {
      id?: string;
      name: string;
    };
    creator?: {
      id?: string;
      name: string;
    };
    labels?: { nodes: Array<{ id?: string; name: string }> };
    updatedAt: string;
    createdAt: string;
  };
  updatedFrom?: {
    [key: string]: unknown;
  };
}

export function normalizeWebhookEvent(
  payload: LinearWebhookPayload,
  webhookId: string
): NormalizedEvent {
  const data = payload.data;
  const eventId = `linear:${data.team.key}:${payload.action}:${data.id}:${webhookId}`;

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
  const labels = data.labels?.nodes?.map((l) => l.name);

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

export function normalizePolledEvent(item: any): NormalizedEvent {
  const data = item.data;
  const eventId = `linear:${item.team}:poll:${data.number}:${Date.now()}`;

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
