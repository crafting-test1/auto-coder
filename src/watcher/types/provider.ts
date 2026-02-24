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

export interface Reactor {
  getLastComment(): Promise<{ author: string; body: string } | null>;
  postComment(comment: string): Promise<string>;
  updateComment(commentId: string, comment: string): Promise<void>;
}

export type EventHandler = (event: unknown, reactor: Reactor) => Promise<void>;

export interface IProvider {
  readonly metadata: ProviderMetadata;

  initialize(config: ProviderConfig): Promise<void>;

  validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: string | Buffer
  ): Promise<boolean>;

  handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    eventHandler: EventHandler
  ): Promise<void>;

  poll(eventHandler: EventHandler): Promise<void>;

  shutdown(): Promise<void>;
}
