import type { WebhookValidationResult } from '../../types/index.js';
import { verifyHmacSignature } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

export class GitHubWebhook {
  constructor(private readonly secret?: string) {}

  validate(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer
  ): WebhookValidationResult {
    const signature = this.getHeader(headers, 'x-hub-signature-256');
    const event = this.getHeader(headers, 'x-github-event');
    const deliveryId = this.getHeader(headers, 'x-github-delivery');

    if (!event) {
      return { valid: false, error: 'Missing X-GitHub-Event header' };
    }

    if (!deliveryId) {
      return { valid: false, error: 'Missing X-GitHub-Delivery header' };
    }

    if (!this.secret) {
      logger.warn('No webhook secret configured, skipping signature verification');
      return { valid: true };
    }

    if (!signature) {
      return { valid: false, error: 'Missing X-Hub-Signature-256 header' };
    }

    const isValid = verifyHmacSignature(
      rawBody,
      signature,
      this.secret,
      'sha256',
      'sha256='
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
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
