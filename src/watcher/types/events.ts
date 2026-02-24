export enum EventType {
  ISSUE = 'issue',
  PULL_REQUEST = 'pull_request',
  TASK = 'task',
  TICKET = 'ticket',
  COMMENT = 'comment',
  REVIEW = 'review',
  STATUS_CHANGE = 'status_change',
}

export enum EventAction {
  CREATED = 'created',
  UPDATED = 'updated',
  CLOSED = 'closed',
  REOPENED = 'reopened',
  DELETED = 'deleted',
  ASSIGNED = 'assigned',
  UNASSIGNED = 'unassigned',
  LABELED = 'labeled',
  UNLABELED = 'unlabeled',
  MERGED = 'merged',
  REVIEWED = 'reviewed',
  COMMENTED = 'commented',
}

export interface Actor {
  id: string;
  username: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ResourceInfo {
  id: string;
  type: EventType;
  title: string;
  description?: string;
  state?: string;
  url: string;
  repository?: string;
  project?: string;
  labels?: string[];
  assignees?: Actor[];
  author?: Actor;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EventMetadata {
  raw?: unknown;
  deliveryId?: string;
  timestamp: Date;
  [key: string]: unknown;
}

export interface WatcherEvent {
  id: string;
  provider: string;
  type: EventType;
  action: EventAction;
  resource: ResourceInfo;
  actor: Actor;
  metadata: EventMetadata;
}
