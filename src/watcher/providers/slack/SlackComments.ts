import { withExponentialRetry } from '../../utils/retry.js';
import { logger } from '../../utils/logger.js';

interface SlackMessage {
  ts: string;
  text: string;
  user: string;
}

/**
 * Slack API client for posting and fetching messages.
 * Uses Slack Web API with Bot OAuth token.
 */
export class SlackComments {
  private readonly baseUrl = 'https://slack.com/api';

  constructor(private readonly token: string) {}

  /**
   * Get the last message in a channel or thread.
   * Used for deduplication to check if bot already responded.
   */
  async getLastMessage(
    channel: string,
    threadTs?: string
  ): Promise<{ user: string; text: string } | null> {
    return withExponentialRetry(async () => {
      const endpoint = `${this.baseUrl}/conversations.replies`;
      const params = new URLSearchParams({
        channel,
        ts: threadTs || '', // If threadTs provided, get thread replies
        limit: '1',
        inclusive: 'true',
      });

      const response = await fetch(`${endpoint}?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn(`Slack API error getting messages: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as { ok: boolean; messages?: SlackMessage[]; error?: string };

      if (!data.ok) {
        logger.warn(`Slack API returned error: ${data.error}`);
        return null;
      }

      if (!data.messages || data.messages.length === 0) {
        return null;
      }

      const lastMessage = data.messages[data.messages.length - 1];
      if (!lastMessage) {
        return null;
      }

      return {
        user: lastMessage.user,
        text: lastMessage.text,
      };
    });
  }

  /**
   * Post a message to a Slack channel or thread.
   * Returns the message timestamp (ts) which can be used as a reference.
   */
  async postMessage(
    channel: string,
    text: string,
    threadTs?: string
  ): Promise<string> {
    return withExponentialRetry(async () => {
      const endpoint = `${this.baseUrl}/chat.postMessage`;

      const payload: any = {
        channel,
        text,
      };

      // If threadTs is provided, reply in thread
      if (threadTs) {
        payload.thread_ts = threadTs;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as { ok: boolean; ts?: string; error?: string };

      if (!data.ok) {
        throw new Error(`Slack API returned error: ${data.error}`);
      }

      if (!data.ts) {
        throw new Error('Slack API did not return message timestamp');
      }

      logger.debug(`Posted message to Slack channel ${channel}${threadTs ? ` (thread: ${threadTs})` : ''}`);

      return data.ts;
    });
  }

  /**
   * Update an existing Slack message.
   */
  /**
   * Get bot user ID.
   * Useful for checking if the bot was mentioned in a message.
   */
  async getBotUserId(): Promise<string> {
    return withExponentialRetry(async () => {
      const endpoint = `${this.baseUrl}/auth.test`;

      logger.debug('Calling Slack auth.test to get bot user ID');

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Slack auth.test HTTP error', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(`Slack API HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as {
        ok: boolean;
        user_id?: string;
        error?: string;
        url?: string;
        team?: string;
        user?: string;
        team_id?: string;
      };

      logger.debug('Slack auth.test response', {
        ok: data.ok,
        error: data.error,
        user_id: data.user_id,
        team: data.team,
        team_id: data.team_id,
      });

      if (!data.ok || !data.user_id) {
        const errorDetails = JSON.stringify({
          error: data.error,
          ok: data.ok,
          response: data,
        });
        throw new Error(`Slack auth failed: ${data.error || 'unknown error'} (${errorDetails})`);
      }

      return data.user_id;
    });
  }
}
