import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import type { Reactor, NormalizedEvent } from '../types/index.js';
import { logger } from './logger.js';

export interface CommandExecutorConfig {
  enabled: boolean;
  command: string;
  promptTemplate?: string;
  promptTemplateFile?: string;
  useStdin?: boolean;
  followUp?: boolean;  // Post/update comment with command output
  dryRun?: boolean;    // Print command instead of executing (for testing)
}

export class CommandExecutor {
  private promptTemplate: HandlebarsTemplateDelegate | undefined;

  constructor(private readonly config: CommandExecutorConfig) {
    if (!config.enabled) {
      return;
    }

    // Register Handlebars helpers
    this.registerHelpers();

    // Load prompt template if provided
    if (config.promptTemplateFile) {
      try {
        const content = readFileSync(config.promptTemplateFile, 'utf-8');
        this.promptTemplate = Handlebars.compile(content);
      } catch (error) {
        logger.error(`Failed to load template file: ${config.promptTemplateFile}`, error);
        throw error;
      }
    } else if (config.promptTemplate) {
      this.promptTemplate = Handlebars.compile(config.promptTemplate);
    }
  }

  private registerHelpers(): void {
    // Register 'eq' helper for equality comparisons
    Handlebars.registerHelper('eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a === b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Register 'ne' helper for inequality comparisons
    Handlebars.registerHelper('ne', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a !== b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Register 'and' helper for logical AND
    Handlebars.registerHelper('and', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a && b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Register 'or' helper for logical OR
    Handlebars.registerHelper('or', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a || b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });
  }

  /**
   * Sanitize a string for safe use in shell commands, filenames, etc.
   * Replaces all special characters with underscores.
   */
  private sanitizeForShell(str: string): string {
    // Replace all non-alphanumeric characters (except dash and underscore) with underscore
    // This ensures the string is safe for use in shell commands, environment variables, filenames
    return str.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Generate a short, clean ID from the normalized event.
   * Format: provider-repository-number (e.g., "github-owner-repo-123")
   * Works across providers (GitHub, GitLab, Jira, Linear, etc.)
   */
  private generateShortId(event: NormalizedEvent): string {
    const provider = event.provider;
    const repo = event.resource.repository.replace(/\//g, '-');
    const number = event.resource.number;
    return `${provider}-${repo}-${number}`;
  }

  async execute(eventId: string, displayString: string, event: NormalizedEvent, reactor: Reactor): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Render prompt template if available
      // Event is already normalized by the provider
      let prompt = '';
      if (this.promptTemplate) {
        prompt = this.promptTemplate(event);
      }

      // Post initial comment with user-friendly display string (always, even in dry-run)
      logger.info(`Executing command for event ${eventId}`);
      const commentRef = await reactor.postComment(`Agent is working on ${displayString}`);

      // Dry-run mode: print command details without executing
      if (this.config.dryRun) {
        logger.info(`[DRY-RUN] Would execute command for event ${eventId}`);
        this.logDryRun(event, prompt);
        logger.info(`[DRY-RUN] Command execution skipped, but deduplication comment posted`);
        return;
      }

      // Run command
      const output = await this.runCommand(eventId, prompt, event);

      // Follow-up with output if enabled
      if (this.config.followUp && output) {
        if (commentRef) {
          await reactor.updateComment(commentRef, output);
          logger.debug(`Updated comment with command output`);
        } else {
          await reactor.postComment(output);
          logger.debug(`Posted new comment with command output`);
        }
      }
    } catch (error) {
      logger.error('Command execution failed', error);
    }
  }

  private logDryRun(event: NormalizedEvent, prompt: string): void {
    // Build environment variables that would be used
    const env: Record<string, string> = {
      EVENT_ID: event.id,
      EVENT_SAFE_ID: this.sanitizeForShell(event.id),
      EVENT_SHORT_ID: this.generateShortId(event),
    };

    if (!this.config.useStdin) {
      env.PROMPT = prompt;
    }

    logger.info('[DRY-RUN] Command:', this.config.command);
    logger.info('[DRY-RUN] Environment variables:');
    for (const [key, value] of Object.entries(env)) {
      if (key === 'PROMPT') {
        logger.info(`  ${key}=${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
      } else {
        logger.info(`  ${key}=${value}`);
      }
    }

    if (this.config.useStdin && prompt) {
      logger.info('[DRY-RUN] Stdin input:');
      logger.info(prompt.substring(0, 500) + (prompt.length > 500 ? '\n...(truncated)' : ''));
    }
  }

  private async runCommand(eventId: string, prompt: string, event: NormalizedEvent): Promise<string> {
    return new Promise((resolve, reject) => {
      // Minimal environment variables - just IDs and prompt
      // All event details should be in the prompt (rendered from template)
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        // Full event ID for internal tracking/logging
        EVENT_ID: event.id,
        // Sanitized ID safe for shell commands (colons/slashes → underscores)
        EVENT_SAFE_ID: this.sanitizeForShell(event.id),
        // Short, clean ID for command/session names (e.g., "github-owner-repo-123")
        EVENT_SHORT_ID: this.generateShortId(event),
      };

      // Add prompt if not using stdin
      if (!this.config.useStdin) {
        env.PROMPT = prompt;
      }

      const child = spawn('/bin/bash', ['-c', this.config.command], {
        env,
        stdio: this.config.useStdin ? 'pipe' : ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      if (this.config.useStdin && child.stdin) {
        child.stdin.write(prompt);
        child.stdin.end();
      }

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('error', (error) => {
        logger.error(`Command execution error for event ${eventId}`, error);
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          logger.info(`Command completed successfully for event ${eventId}`);
          if (stdout) {
            logger.debug(`Command output length: ${stdout.length} chars`);
          }
          resolve(stdout);
        } else {
          logger.error(
            `Command failed for event ${eventId} with code ${code}`,
            { stderr }
          );
          reject(new Error(`Command exited with code ${code}: ${stderr}`));
        }
      });
    });
  }
}
