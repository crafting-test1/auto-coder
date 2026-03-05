import { Watcher } from './watcher/Watcher.js';
import { ConfigLoader } from './watcher/core/ConfigLoader.js';
import { GitHubProvider } from './watcher/providers/github/GitHubProvider.js';
import { GitLabProvider } from './watcher/providers/gitlab/GitLabProvider.js';
import { LinearProvider } from './watcher/providers/linear/LinearProvider.js';
import { SlackProvider } from './watcher/providers/slack/SlackProvider.js';
import { JiraProvider } from './watcher/providers/jira/JiraProvider.js';

async function main(): Promise<void> {
  const configPath =
    process.env.WATCHER_CONFIG || './config/watcher.yaml';

  try {
    const config = ConfigLoader.load(configPath);

    const watcher = new Watcher(config);

    if (config.providers.github?.enabled) {
      watcher.registerProvider('github', new GitHubProvider());
    }
    if (config.providers.gitlab?.enabled) {
      watcher.registerProvider('gitlab', new GitLabProvider());
    }
    if (config.providers.linear?.enabled) {
      watcher.registerProvider('linear', new LinearProvider());
    }
    if (config.providers.slack?.enabled) {
      watcher.registerProvider('slack', new SlackProvider());
    }
    if (config.providers.jira?.enabled) {
      watcher.registerProvider('jira', new JiraProvider());
    }
  } catch (error) {
    console.error('Failed to load configuration or initialize providers.', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error occurred:', error);
  process.exit(1);
});