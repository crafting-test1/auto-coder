import type { ProviderConfig } from './provider.js';

export interface ServerConfig {
  host: string;
  port: number;
  basePath?: string;
}

export interface DeduplicationConfig {
  enabled: boolean;
  botUsername: string | string[];  // Support single username or array of identifiers
  commentTemplate?: string;
}

export interface CommandExecutorConfig {
  enabled: boolean;
  command: string;
  promptTemplate?: string;
  promptTemplateFile?: string;
  useStdin?: boolean;
  followUp?: boolean;
}

export interface WatcherConfig {
  server?: ServerConfig;
  deduplication?: DeduplicationConfig;
  commandExecutor?: CommandExecutorConfig;
  providers: Record<string, ProviderConfig>;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
