export { Watcher } from './Watcher.js';

export { ConfigLoader } from './core/ConfigLoader.js';
export { Deduplicator } from './core/Deduplicator.js';
export { CommentDeduplicator } from './core/CommentDeduplicator.js';

export { BaseProvider } from './providers/BaseProvider.js';
export { ProviderRegistry } from './providers/ProviderRegistry.js';
export { GitHubProvider } from './providers/github/GitHubProvider.js';

export type {
  WatcherConfig,
  ServerConfig,
  DeduplicationConfig,
  RateLimitConfig,
  WatcherEvent,
  EventMetadata,
  Actor,
  ResourceInfo,
  IProvider,
  ProviderConfig,
  ProviderAuth,
  ProviderMetadata,
  WebhookValidationResult,
  NormalizedWebhookResult,
} from './types/index.js';

export { EventType, EventAction } from './types/index.js';

export {
  WatcherError,
  ProviderError,
  ConfigError,
  ValidationError,
} from './utils/errors.js';

export { logger } from './utils/logger.js';
