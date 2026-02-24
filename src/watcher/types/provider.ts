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
  capabilities: {
    webhook: boolean;
    polling: boolean;
  };
}

export interface ProviderConfig {
  enabled: boolean;
  mode: 'webhook' | 'polling' | 'both';
  webhookSecret?: string;
  webhookSecretEnv?: string;
  webhookSecretFile?: string;
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

  validateWebhook?(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: string | Buffer
  ): Promise<WebhookValidationResult>;

  normalizeWebhook?(
    headers: Record<string, string | string[] | undefined>,
    body: unknown
  ): Promise<NormalizedWebhookResult>;

  poll?(): Promise<WatcherEvent[]>;

  getLastComment?(
    repository: string,
    resourceType: string,
    resourceNumber: number
  ): Promise<CommentInfo | null>;

  postComment?(
    repository: string,
    resourceType: string,
    resourceNumber: number,
    comment: string
  ): Promise<void>;

  shutdown(): Promise<void>;
}
