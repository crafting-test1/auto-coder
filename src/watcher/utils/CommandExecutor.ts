import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import type { Reactor } from '../types/index.js';
import { logger } from './logger.js';

export interface CommandExecutorConfig {
  enabled: boolean;
  command: string;
  promptTemplate?: string;
  promptTemplateFile?: string;
  useStdin?: boolean;
  followUp?: boolean;  // Post/update comment with command output
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

  async execute(eventId: string, event: unknown, reactor: Reactor): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Render prompt template if available
      let prompt = '';
      if (this.promptTemplate) {
        prompt = this.promptTemplate(event);
      }

      // Post initial comment
      logger.info(`Executing command for event ${eventId}`);
      const commentRef = await reactor.postComment(`Agent is working on session ${eventId}`);

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

  private async runCommand(eventId: string, prompt: string, event: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        EVENT_ID: eventId,
      };

      if (!this.config.useStdin) {
        env.PROMPT = prompt;
      }

      // Add any additional event data to environment
      if (event && typeof event === 'object') {
        const obj = event as Record<string, unknown>;
        if (obj.action) env.EVENT_ACTION = String(obj.action);
        if (obj.repository && typeof obj.repository === 'object') {
          const repo = obj.repository as Record<string, unknown>;
          if (repo.full_name) env.EVENT_REPOSITORY = String(repo.full_name);
        }
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
