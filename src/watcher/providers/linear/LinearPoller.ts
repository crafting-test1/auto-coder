import { logger } from '../../utils/logger.js';

interface LinearPollerConfig {
  apiKey: string;
  teams?: string[];
  initialLookbackHours?: number;
  maxItemsPerPoll?: number;
}

interface LinearItem {
  type: 'issue';
  team: string;
  number: number;
  data: any;
}

export class LinearPoller {
  private lastPoll: Date | undefined;
  private readonly apiUrl = 'https://api.linear.app/graphql';

  constructor(private readonly config: LinearPollerConfig) {}

  async poll(): Promise<LinearItem[]> {
    const allItems: LinearItem[] = [];

    let since = this.lastPoll;

    if (!since) {
      const lookbackHours = this.config.initialLookbackHours ?? 1;
      since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
      logger.info(`First poll for Linear, looking back ${lookbackHours} hour(s)`);
    }

    try {
      const issues = await this.fetchIssues(since);
      logger.debug(`Found ${issues.length} issues from Linear`);
      allItems.push(...issues);

      this.lastPoll = new Date();

      // Apply max items limit if configured
      if (this.config.maxItemsPerPoll && allItems.length > this.config.maxItemsPerPoll) {
        logger.debug(`Limiting to max items per poll: ${this.config.maxItemsPerPoll}`);
        return allItems.slice(0, this.config.maxItemsPerPoll);
      }
    } catch (error) {
      logger.error('Error polling Linear', error);
    }

    return allItems;
  }

  private async fetchIssues(since: Date): Promise<LinearItem[]> {
    const query = `
      query GetIssues($updatedAt: DateTime!) {
        issues(
          filter: { updatedAt: { gte: $updatedAt } }
          orderBy: updatedAt
        ) {
          nodes {
            id
            identifier
            number
            title
            description
            url
            state {
              name
            }
            team {
              key
              name
            }
            assignee {
              name
            }
            creator {
              name
            }
            labels {
              nodes {
                name
              }
            }
            updatedAt
            createdAt
          }
        }
      }
    `;

    logger.debug(`Polling Linear issues updated after ${since.toISOString()}`);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { updatedAt: since.toISOString() },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch issues: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const data = result as any;

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const issues = data.data?.issues?.nodes || [];
    const items: LinearItem[] = [];

    for (const issue of issues) {
      // Filter by team if configured
      if (this.config.teams && this.config.teams.length > 0) {
        if (!this.config.teams.includes(issue.team.key)) {
          logger.debug(`Skipping issue ${issue.identifier} (team ${issue.team.key} not in filter)`);
          continue;
        }
      }

      // Filter by updated_at
      if (since && new Date(issue.updatedAt) <= since) {
        logger.debug(`Skipping issue ${issue.identifier} (not updated since last poll)`);
        continue;
      }

      items.push({
        type: 'issue',
        team: issue.team.key,
        number: issue.number,
        data: issue,
      });
    }

    return items;
  }
}
