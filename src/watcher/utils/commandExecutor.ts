import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import type { WatcherEvent, IProvider, CommandExecutorConfig } from '../types/index.js';
import { logger } from './logger.js';

const DEFAULT_PROMPT_TEMPLATE = `
Event received: {{provider}}/{{type}}/{{action}}

Resource: {{resource.title}}
URL: {{resource.url}}
{{#if resource.repository}}Repository: {{resource.repository}}{{/if}}
{{#if resource.description}}
Description:
{{resource.description}}
{{/if}}

Actor: {{actor.username}}
Event ID: {{id}}
Timestamp: {{metadata.timestamp}}
`;

const DEFAULT_INITIAL_COMMENT = '🤖 Agent is processing event {{id}}';

export class CommandExecutor {
  private promptTemplate: HandlebarsTemplateDelegate;
  private initialCommentTemplate?: HandlebarsTemplateDelegate;
  private providers: Map<string, IProvider> = new Map();

  constructor(private readonly config: CommandExecutorConfig) {
    // Register common Handlebars helpers
    this.registerHelpers();

    this.promptTemplate = this.loadTemplate(
      config.promptTemplate,
      config.promptTemplateFile,
      DEFAULT_PROMPT_TEMPLATE
    );

    if (config.postInitialComment && config.initialCommentTemplate) {
      this.initialCommentTemplate = Handlebars.compile(config.initialCommentTemplate);
    } else if (config.postInitialComment) {
      this.initialCommentTemplate = Handlebars.compile(DEFAULT_INITIAL_COMMENT);
    }
  }

  private registerHelpers(): void {
    // Register 'eq' helper for equality comparisons (block helper)
    Handlebars.registerHelper('eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a === b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Register 'ne' helper for inequality comparisons (block helper)
    Handlebars.registerHelper('ne', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a !== b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Register 'and' helper for logical AND (block helper)
    Handlebars.registerHelper('and', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a && b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Register 'or' helper for logical OR (block helper)
    Handlebars.registerHelper('or', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      if (a || b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });
  }

  setProviders(providers: Map<string, IProvider>): void {
    this.providers = providers;
  }

  private loadTemplate(
    template?: string,
    templateFile?: string,
    defaultTemplate?: string
  ): HandlebarsTemplateDelegate {
    if (templateFile) {
      try {
        const content = readFileSync(templateFile, 'utf-8');
        return Handlebars.compile(content);
      } catch (error) {
        logger.error(`Failed to load template file: ${templateFile}`, error);
        throw error;
      }
    }

    if (template) {
      return Handlebars.compile(template);
    }

    if (defaultTemplate) {
      return Handlebars.compile(defaultTemplate);
    }

    throw new Error('No template provided');
  }

  async execute(event: WatcherEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const prompt = this.promptTemplate(event);

      if (this.config.postInitialComment && this.initialCommentTemplate) {
        await this.postInitialComment(event);
      }

      const output = await this.runCommand(prompt, event);

      if (this.config.postOutputComment && output) {
        await this.postOutputComment(event, output);
      }
    } catch (error) {
      logger.error('Command execution failed', error);
    }
  }

  private async postInitialComment(event: WatcherEvent): Promise<void> {
    if (!this.initialCommentTemplate) {
      return;
    }

    const provider = this.providers.get(event.provider);
    if (!provider) {
      logger.warn(`Provider ${event.provider} not found`);
      return;
    }

    try {
      const comment = this.initialCommentTemplate(event);
      await provider.postComment(event, comment);
      logger.debug(`Posted initial comment for event ${event.id}`);
    } catch (error) {
      logger.error('Failed to post initial comment', error);
    }
  }

  private async postOutputComment(event: WatcherEvent, output: string): Promise<void> {
    const provider = this.providers.get(event.provider);
    if (!provider) {
      logger.warn(`Provider ${event.provider} not found`);
      return;
    }

    try {
      await provider.postComment(event, output);
      logger.debug(`Posted output comment for event ${event.id}`);
    } catch (error) {
      logger.error('Failed to post output comment', error);
    }
  }

  private async runCommand(prompt: string, event: WatcherEvent): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.info(`Executing command for event ${event.id}`);

      const env: Record<string, string> = {
        ...process.env,
        EVENT_ID: event.id,
        EVENT_PROVIDER: event.provider,
        EVENT_TYPE: event.type,
        EVENT_ACTION: event.action,
        RESOURCE_URL: event.resource.url,
        RESOURCE_TITLE: event.resource.title,
        ACTOR_USERNAME: event.actor.username,
      } as Record<string, string>;

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
        logger.error(`Command execution error for event ${event.id}`, error);
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          logger.info(`Command completed successfully for event ${event.id}`);
          if (stdout) {
            logger.debug(`Command output:\n${stdout}`);
          }
          resolve(stdout);
        } else {
          logger.error(
            `Command failed for event ${event.id} with code ${code}`,
            { stderr }
          );
          reject(new Error(`Command exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

}
