import type { ProviderConfig } from './provider.js';

export interface ServerConfig {
  host: string;
  port: number;
  basePath?: string;
}

export interface RateLimitConfig {
  enabled?: boolean;
  windowMs?: number;
  max?: number;
}

export interface DeduplicationConfig {
  enabled: boolean;
  strategy: 'comment' | 'memory';
  ttl?: number;
  maxSize?: number;
  botUsername?: string;
  commentTemplate?: string;
}

export interface WatcherConfig {
  server?: ServerConfig;
  deduplication?: DeduplicationConfig;
  rateLimit?: RateLimitConfig;
  providers: Record<string, ProviderConfig>;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
