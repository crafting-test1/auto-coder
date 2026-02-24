import type { IProvider } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ProviderError } from '../utils/errors.js';

export class Poller {
  private intervalId: NodeJS.Timeout | undefined;
  private polling = false;
  private errorCount = 0;
  private readonly maxErrorCount = 5;
  private readonly baseBackoff = 1000;

  constructor(
    private readonly provider: IProvider,
    private readonly intervalMs: number,
    private readonly onEvent: (events: Array<unknown>) => Promise<void>
  ) {}

  start(): void {
    if (this.intervalId) {
      logger.warn(
        `Poller already running for provider ${this.provider.metadata.name}`
      );
      return;
    }

    logger.info(
      `Starting poller for ${this.provider.metadata.name} (interval: ${this.intervalMs}ms)`
    );

    this.poll();

    this.intervalId = setInterval(() => {
      this.poll();
    }, this.intervalMs);

    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info(`Stopped poller for ${this.provider.metadata.name}`);
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) {
      logger.debug(`Skipping poll for ${this.provider.metadata.name} (already polling)`);
      return;
    }

    if (this.errorCount >= this.maxErrorCount) {
      logger.error(
        `Poller for ${this.provider.metadata.name} disabled due to excessive errors`
      );
      this.stop();
      return;
    }

    this.polling = true;

    try {
      if (!this.provider.poll) {
        throw new ProviderError(
          'Provider does not support polling',
          this.provider.metadata.name
        );
      }

      logger.debug(`Polling ${this.provider.metadata.name}...`);
      const events = await this.provider.poll();

      if (events.length > 0) {
        logger.debug(
          `Received ${events.length} events from ${this.provider.metadata.name} poll`
        );
        await this.onEvent(events);
      }

      this.errorCount = 0;
    } catch (error) {
      this.errorCount++;
      const backoffMs = Math.min(
        this.baseBackoff * Math.pow(2, this.errorCount - 1),
        60000
      );

      logger.error(
        `Poll failed for ${this.provider.metadata.name} (error ${this.errorCount}/${this.maxErrorCount}, backing off ${backoffMs}ms)`,
        error
      );

      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    } finally {
      this.polling = false;
    }
  }

  get isRunning(): boolean {
    return this.intervalId !== undefined;
  }
}
