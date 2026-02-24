import type { WatcherConfig, IProvider, EventHandler, Reactor } from './types/index.js';
import { WatcherEventEmitter } from './core/EventEmitter.js';
import { ProviderRegistry } from './providers/ProviderRegistry.js';
import { WebhookServer } from './transport/WebhookServer.js';
import { WebhookHandler } from './transport/WebhookHandler.js';
import { Poller } from './transport/Poller.js';
import { CommandExecutor } from './utils/CommandExecutor.js';
import { logger } from './utils/logger.js';
import { WatcherError, ProviderError } from './utils/errors.js';

export class Watcher extends WatcherEventEmitter {
  private registry: ProviderRegistry;
  private botUsername: string;
  private commentTemplate: string;
  private commandExecutor: CommandExecutor | undefined;
  private server: WebhookServer | undefined;
  private pollers: Map<string, Poller> = new Map();
  private started = false;

  constructor(private readonly config: WatcherConfig) {
    super();

    if (config.logLevel) {
      logger.setLevel(config.logLevel);
    }

    this.registry = new ProviderRegistry();

    if (!config.deduplication) {
      throw new WatcherError('Deduplication configuration is required');
    }

    if (!config.deduplication.botUsername) {
      throw new WatcherError('botUsername is required for comment-based deduplication');
    }

    this.botUsername = config.deduplication.botUsername;
    this.commentTemplate =
      config.deduplication.commentTemplate ||
      'Agent is working on session {id}';

    if (config.commandExecutor?.enabled) {
      this.commandExecutor = new CommandExecutor(config.commandExecutor);
    }
  }

  registerProvider(name: string, provider: IProvider): void {
    if (this.started) {
      throw new WatcherError('Cannot register providers after watcher has started');
    }

    this.registry.register(name, provider);
  }

  unregisterProvider(name: string): void {
    if (this.started) {
      throw new WatcherError('Cannot unregister providers while watcher is running');
    }

    this.registry.unregister(name);
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new WatcherError('Watcher is already started');
    }

    logger.info('Starting watcher...');

    try {
      await this.initializeProviders();
      await this.startWebhookServer();
      await this.startPollers();

      this.started = true;
      this.emit('started');
      logger.info('Watcher started successfully');
    } catch (error) {
      logger.error('Failed to start watcher', error);
      await this.cleanup();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    logger.info('Stopping watcher...');

    try {
      this.stopPollers();

      if (this.server) {
        await this.server.stop();
        this.server = undefined;
      }

      await this.shutdownProviders();

      this.started = false;
      this.emit('stopped');
      logger.info('Watcher stopped successfully');
    } catch (error) {
      logger.error('Error during shutdown', error);
      throw error;
    }
  }

  private async initializeProviders(): Promise<void> {
    const providers = this.registry.getAll();

    if (providers.size === 0) {
      throw new WatcherError('No providers registered');
    }

    for (const [name, provider] of providers.entries()) {
      const providerConfig = this.config.providers[name];

      if (!providerConfig) {
        throw new ProviderError(
          `No configuration found for registered provider: ${name}`,
          name
        );
      }

      if (!providerConfig.enabled) {
        logger.info(`Provider ${name} is disabled, skipping initialization`);
        continue;
      }

      try {
        await provider.initialize(providerConfig);
        logger.info(`Initialized provider: ${name}`);
      } catch (error) {
        throw new ProviderError(
          `Failed to initialize provider: ${name}`,
          name,
          error
        );
      }
    }
  }

  private createEventHandler(providerName: string): EventHandler {
    return async (event: unknown, reactor: Reactor) => {
      try {
        // Check for duplicates using reactor
        const isDuplicate = await this.isDuplicate(reactor);

        if (isDuplicate) {
          logger.debug(`Event from ${providerName} is a duplicate, skipping`);
          return;
        }

        // Emit event to subscribers
        logger.debug(`Emitting event from ${providerName}`);
        this.emit('event', providerName, event);

        // Execute command if configured
        if (this.commandExecutor) {
          // Extract event ID from normalized event
          const eventId = this.extractEventId(event);
          await this.commandExecutor.execute(eventId, event, reactor);
        } else {
          // If no command executor, mark as processed manually
          await this.markAsProcessed(reactor, event);
        }
      } catch (error) {
        logger.error(`Error handling event from ${providerName}`, error);
        this.emit('error', error as Error);
      }
    };
  }

  private async isDuplicate(reactor: Reactor): Promise<boolean> {
    try {
      const lastComment = await reactor.getLastComment();

      if (!lastComment) {
        logger.debug('No comments found');
        return false;
      }

      const isDuplicate = lastComment.author === this.botUsername;

      if (isDuplicate) {
        logger.info(`Duplicate detected (last comment by ${this.botUsername})`);
      }

      return isDuplicate;
    } catch (error) {
      logger.error('Error checking for duplicate via comments', error);
      return false;
    }
  }

  private async markAsProcessed(reactor: Reactor, event: unknown): Promise<void> {
    try {
      // Generate a simple ID from the event for the comment template
      const eventId = this.generateEventId(event);
      const comment = this.commentTemplate.replace('{id}', eventId);

      await reactor.postComment(comment);
      logger.debug(`Posted deduplication comment`);
    } catch (error) {
      logger.error('Error posting comment', error);
    }
  }

  private extractEventId(event: unknown): string {
    // Extract ID from normalized event structure
    if (event && typeof event === 'object') {
      const obj = event as Record<string, unknown>;
      if (obj.id) return String(obj.id);

      // Fallback to resource number if available
      if (obj.resource && typeof obj.resource === 'object') {
        const resource = obj.resource as Record<string, unknown>;
        if (resource.number) return String(resource.number);
      }
    }
    return Date.now().toString();
  }

  private generateEventId(event: unknown): string {
    // Try to extract an ID from normalized event structure
    return this.extractEventId(event);
  }

  private async startWebhookServer(): Promise<void> {
    const needsWebhook = Array.from(this.registry.getAll().entries()).some(
      ([name]) => {
        const config = this.config.providers[name];
        return config?.enabled;
      }
    );

    if (!needsWebhook) {
      logger.info('No webhook providers configured, skipping server startup');
      return;
    }

    const serverConfig = this.config.server || {
      host: '0.0.0.0',
      port: 3000,
    };

    this.server = new WebhookServer(serverConfig);

    for (const [name, provider] of this.registry.getAll().entries()) {
      const config = this.config.providers[name];

      if (!config?.enabled) {
        continue;
      }

      const eventHandler = this.createEventHandler(name);
      const handler = new WebhookHandler(provider, eventHandler);

      this.server.registerWebhook(name, handler.handle.bind(handler));
    }

    await this.server.start();
  }

  private async startPollers(): Promise<void> {
    for (const [name, provider] of this.registry.getAll().entries()) {
      const config = this.config.providers[name];

      if (!config?.enabled) {
        continue;
      }

      const hasAuth = config.auth !== undefined;
      const options = config.options as { repositories?: string[] } | undefined;
      const hasRepositories = options?.repositories && options.repositories.length > 0;

      // Only start poller if auth and repositories are configured
      if (!hasAuth || !hasRepositories) {
        continue;
      }

      const intervalMs = (config.pollingInterval || 60) * 1000;
      const eventHandler = this.createEventHandler(name);

      const poller = new Poller(provider, intervalMs, eventHandler);

      this.pollers.set(name, poller);
      poller.start();
    }
  }

  private stopPollers(): void {
    for (const [name, poller] of this.pollers.entries()) {
      poller.stop();
      logger.debug(`Stopped poller: ${name}`);
    }
    this.pollers.clear();
  }

  private async shutdownProviders(): Promise<void> {
    for (const [name, provider] of this.registry.getAll().entries()) {
      try {
        await provider.shutdown();
        logger.debug(`Shutdown provider: ${name}`);
      } catch (error) {
        logger.error(`Error shutting down provider ${name}`, error);
      }
    }
  }

  private async cleanup(): Promise<void> {
    this.stopPollers();

    if (this.server) {
      try {
        await this.server.stop();
      } catch (error) {
        logger.error('Error stopping server during cleanup', error);
      }
      this.server = undefined;
    }
  }

  get isStarted(): boolean {
    return this.started;
  }
}
