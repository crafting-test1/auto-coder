import type { WatcherEvent } from './events.js';

export interface ProviderAuth {
  type: 'token' | 'oauth' | 'basic' | 'none';
  token?: string;
  tokenEnv?: string;
  tokenFile?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface ProviderMetadata {
  name: string;
  version: string;
}

export interface ProviderConfig {
  enabled: boolean;
  pollingInterval?: number;
  auth?: ProviderAuth;
  options?: Record<string, unknown>;
}

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

export interface NormalizedWebhookResult {
  events: WatcherEvent[];
  deliveryId?: string;
}

export interface CommentInfo {
  author: string;
  body: string;
  createdAt: Date;
}

export interface IProvider {
  readonly metadata: ProviderMetadata;

  initialize(config: ProviderConfig): Promise<void>;

  validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: string | Buffer
  ): Promise<WebhookValidationResult>;

  normalizeWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown
  ): Promise<NormalizedWebhookResult>;

  poll(): Promise<WatcherEvent[]>;

  getLastComment(event: WatcherEvent): Promise<CommentInfo | null>;

  postComment(event: WatcherEvent, comment: string): Promise<void>;

  shutdown(): Promise<void>;
}
