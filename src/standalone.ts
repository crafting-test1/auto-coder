import { Watcher } from './watcher/Watcher.js';
import { ConfigLoader } from './watcher/core/ConfigLoader.js';
import { GitHubProvider } from './watcher/providers/github/GitHubProvider.js';
import { logger } from './watcher/utils/logger.js';

async function main(): Promise<void> {
  const configPath =
    process.env.WATCHER_CONFIG || './config/watcher.yaml';

  try {
    const config = ConfigLoader.load(configPath);

    const watcher = new Watcher(config);

    if (config.providers.github?.enabled) {
      watcher.registerProvider('github', new GitHubProvider());
    }

    watcher.on('event', (provider, event) => {
      logger.info('Received event', {
        provider,
        event,
      });
    });

    watcher.on('error', (error) => {
      logger.error('Watcher error', error);
    });

    const shutdown = async (): Promise<void> => {
      logger.info('Received shutdown signal');
      try {
        await watcher.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    await watcher.start();

    logger.info('Watcher is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Fatal error', error);
    process.exit(1);
  }
}

main();
