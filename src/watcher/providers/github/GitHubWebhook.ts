import type { WebhookValidationResult } from '../../types/index.js';

export class GitHubWebhook {
  validate(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer
  ): WebhookValidationResult {
    const event = this.getHeader(headers, 'x-github-event');
    const deliveryId = this.getHeader(headers, 'x-github-delivery');

    if (!event) {
      return { valid: false, error: 'Missing X-GitHub-Event header' };
    }

    if (!deliveryId) {
      return { valid: false, error: 'Missing X-GitHub-Delivery header' };
    }

    return { valid: true };
  }

  extractMetadata(
    headers: Record<string, string | string[] | undefined>
  ): { event: string; deliveryId: string } {
    const event = this.getHeader(headers, 'x-github-event');
    const deliveryId = this.getHeader(headers, 'x-github-delivery');

    if (!event || !deliveryId) {
      throw new Error('Missing required GitHub webhook headers');
    }

    return { event, deliveryId };
  }

  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
