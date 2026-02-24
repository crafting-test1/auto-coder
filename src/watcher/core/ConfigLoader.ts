import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import type { WatcherConfig } from '../types/index.js';
import { ConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class ConfigLoader {
  static load(configPath: string): WatcherConfig {
    try {
      logger.info(`Loading configuration from ${configPath}`);
      const fileContent = readFileSync(configPath, 'utf-8');
      const interpolatedContent = this.interpolateEnvVars(fileContent);
      const config = load(interpolatedContent) as WatcherConfig;
      this.validate(config);
      return config;
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(`Failed to load configuration: ${configPath}`, error);
    }
  }

  private static interpolateEnvVars(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        logger.warn(`Environment variable ${varName} not found, keeping placeholder`);
        return match;
      }
      return value;
    });
  }

  private static validate(config: WatcherConfig): void {
    if (!config.providers || typeof config.providers !== 'object') {
      throw new ConfigError('Configuration must include "providers" object');
    }

    if (Object.keys(config.providers).length === 0) {
      throw new ConfigError('At least one provider must be configured');
    }

    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (!providerConfig.enabled) {
        continue;
      }

      const hasAuthConfig = providerConfig.auth !== undefined;

      if (!hasAuthConfig) {
        logger.warn(
          `Provider ${name}: No auth configured. Polling mode and comment-based deduplication will not be available.`
        );
      }
    }
  }

  static resolveSecret(
    value?: string,
    envVar?: string,
    file?: string
  ): string | undefined {
    if (value) {
      return value;
    }

    if (envVar) {
      const envValue = process.env[envVar];
      if (!envValue) {
        throw new ConfigError(`Environment variable ${envVar} not found`);
      }
      return envValue;
    }

    if (file) {
      try {
        return readFileSync(file, 'utf-8').trim();
      } catch (error) {
        throw new ConfigError(`Failed to read secret from file: ${file}`, error);
      }
    }

    return undefined;
  }
}
