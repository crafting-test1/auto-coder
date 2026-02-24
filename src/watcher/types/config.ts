import type { ProviderConfig } from './provider.js';

export interface ServerConfig {
  host: string;
  port: number;
  basePath?: string;
}

export interface DeduplicationConfig {
  enabled: boolean;
  strategy: 'comment' | 'memory';
  ttl?: number;
  maxSize?: number;
  botUsername?: string;
  commentTemplate?: string;
}

export interface CommandExecutorConfig {
  enabled: boolean;
  command: string;
  promptTemplate?: string;
  promptTemplateFile?: string;
  useStdin?: boolean;
  postInitialComment?: boolean;
  initialCommentTemplate?: string;
  postOutputComment?: boolean;
}

export interface WatcherConfig {
  server?: ServerConfig;
  deduplication?: DeduplicationConfig;
  commandExecutor?: CommandExecutorConfig;
  providers: Record<string, ProviderConfig>;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
