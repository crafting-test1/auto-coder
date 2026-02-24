import type { WatcherConfig, IProvider, WatcherEvent } from './types/index.js';
import { WatcherEventEmitter } from './core/EventEmitter.js';
import { Deduplicator } from './core/Deduplicator.js';
import { CommentDeduplicator } from './core/CommentDeduplicator.js';
import { ProviderRegistry } from './providers/ProviderRegistry.js';
import { WebhookServer } from './transport/WebhookServer.js';
import { WebhookHandler } from './transport/WebhookHandler.js';
import { Poller } from './transport/Poller.js';
import { CommandExecutor } from './utils/commandExecutor.js';
import { logger } from './utils/logger.js';
import { WatcherError, ProviderError } from './utils/errors.js';

export class Watcher extends WatcherEventEmitter {
  private registry: ProviderRegistry;
  private deduplicator: Deduplicator | CommentDeduplicator;
  private deduplicationStrategy: 'comment' | 'memory';
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

    const deduplicationConfig = config.deduplication || {
      enabled: true,
      strategy: 'memory' as const,
      ttl: 3600,
      maxSize: 10000,
    };

    this.deduplicationStrategy = deduplicationConfig.strategy || 'memory';

    if (this.deduplicationStrategy === 'comment') {
      this.deduplicator = new CommentDeduplicator(deduplicationConfig);
    } else {
      this.deduplicator = new Deduplicator({
        enabled: deduplicationConfig.enabled,
        strategy: 'memory',
        ttl: deduplicationConfig.ttl || 3600,
        maxSize: deduplicationConfig.maxSize || 10000,
      });
    }

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

      if (this.deduplicationStrategy === 'comment') {
        (this.deduplicator as CommentDeduplicator).setProviders(
          this.registry.getAll()
        );
      }

      if (this.commandExecutor) {
        this.commandExecutor.setProviders(this.registry.getAll());
      }

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

      this.deduplicator.shutdown();

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

  private async startWebhookServer(): Promise<void> {
    const needsWebhook = Array.from(this.registry.getAll().entries()).some(
      ([name, provider]) => {
        const config = this.config.providers[name];
        return (
          config?.enabled &&
          provider.metadata.capabilities.webhook &&
          provider.validateWebhook &&
          provider.normalizeWebhook
        );
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

      if (
        !provider.metadata.capabilities.webhook ||
        !provider.validateWebhook ||
        !provider.normalizeWebhook
      ) {
        continue;
      }

      const handler = new WebhookHandler(provider, async (events) => {
        await this.handleEvents(events as WatcherEvent[]);
      });

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

      if (!provider.metadata.capabilities.polling || !provider.poll) {
        continue;
      }

      const hasAuth = config.auth !== undefined;
      const options = config.options as { repositories?: string[] } | undefined;
      const hasRepositories = options?.repositories && options.repositories.length > 0;

      if (!hasAuth || !hasRepositories) {
        continue;
      }

      const intervalMs = (config.pollingInterval || 60) * 1000;

      const poller = new Poller(provider, intervalMs, async (events) => {
        await this.handleEvents(events as WatcherEvent[]);
      });

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

  private async handleEvents(events: WatcherEvent[]): Promise<void> {
    for (const event of events) {
      let isDuplicate = false;

      if (this.deduplicationStrategy === 'comment') {
        isDuplicate = await (this.deduplicator as CommentDeduplicator).isDuplicate(
          event
        );
      } else {
        isDuplicate = (this.deduplicator as Deduplicator).isDuplicate(event.id);
      }

      if (isDuplicate) {
        continue;
      }

      logger.debug(`Emitting event: ${event.id}`);
      this.emit('event', event);

      if (this.commandExecutor) {
        await this.commandExecutor.execute(event);
      }

      if (this.deduplicationStrategy === 'comment') {
        await (this.deduplicator as CommentDeduplicator).markAsProcessed(event);
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

    this.deduplicator.shutdown();
  }

  get isStarted(): boolean {
    return this.started;
  }
}
