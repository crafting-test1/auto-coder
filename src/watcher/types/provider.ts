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
}

/**
 * Normalized event structure that all providers must map to.
 * This provides a consistent interface for command execution and event handling.
 */
export interface NormalizedEvent {
  /** Unique event identifier (e.g., "github:owner/repo:opened:123:uuid") */
  id: string;

  /** Provider name (e.g., "github", "gitlab", "jira") */
  provider: string;

  /** Event type (e.g., "issue", "pull_request", "task") */
  type: string;

  /** Action that triggered the event (e.g., "opened", "closed", "edited") */
  action: string;

  /** Resource information */
  resource: {
    /** Resource number/ID (e.g., issue #123) */
    number: number;

    /** Resource title/summary */
    title: string;

    /** Resource description/body */
    description: string;

    /** Resource URL */
    url: string;

    /** Resource state (e.g., "open", "closed") */
    state: string;

    /** Repository full name (e.g., "owner/repo") */
    repository: string;

    /** Author username */
    author?: string;

    /** Assignees (provider-specific structure) */
    assignees?: unknown[];

    /** Labels/tags */
    labels?: string[];

    /** Branch name (for PRs/MRs) */
    branch?: string;

    /** Target branch (for PRs/MRs) */
    mergeTo?: string;

    /** Comment information (when event is triggered by a comment) */
    comment?: {
      /** Comment body/content */
      body: string;
      /** Comment author */
      author: string;
      /** Comment URL (if available) */
      url?: string;
    };
  };

  /** Actor who triggered the event */
  actor: {
    /** Actor username */
    username: string;

    /** Actor ID (provider-specific) */
    id: number | string;
  };

  /** Event metadata */
  metadata: {
    /** Event timestamp */
    timestamp: string;

    /** Delivery ID (for webhooks) */
    deliveryId?: string;

    /** Whether this was from polling */
    polled?: boolean;

    /** Additional provider-specific metadata */
    [key: string]: unknown;
  };

  /** Original raw event from provider (for debugging/templates) */
  raw: unknown;
}

export type EventHandler = (event: NormalizedEvent, reactor: Reactor) => Promise<void>;

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
