import type { Request, Response } from 'express';
import type { IProvider } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

export class WebhookHandler {
  constructor(
    private readonly provider: IProvider,
    private readonly onEvent: (events: Array<unknown>) => Promise<void>
  ) {}

  async handle(req: Request, res: Response): Promise<void> {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const contentType = req.get('content-type');
      if (!contentType?.includes('application/json')) {
        res.status(400).json({ error: 'Content-Type must be application/json' });
        return;
      }

      if (!this.provider.validateWebhook) {
        res.status(501).json({ error: 'Provider does not support webhooks' });
        return;
      }

      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      const validationResult = await this.provider.validateWebhook(
        req.headers,
        req.body,
        rawBody
      );

      if (!validationResult.valid) {
        logger.warn(
          `Webhook validation failed: ${validationResult.error}`,
          { provider: this.provider.metadata.name }
        );
        res.status(401).json({ error: validationResult.error || 'Invalid webhook' });
        return;
      }

      res.status(202).json({ status: 'accepted' });

      setImmediate(() => {
        this.processWebhook(req.headers, req.body).catch((error) => {
          logger.error('Failed to process webhook', error);
        });
      });
    } catch (error) {
      logger.error('Webhook handler error', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private async processWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown
  ): Promise<void> {
    if (!this.provider.normalizeWebhook) {
      throw new ValidationError('Provider does not implement normalizeWebhook');
    }

    const result = await this.provider.normalizeWebhook(headers, body);

    logger.debug(
      `Normalized ${result.events.length} events from webhook`,
      { provider: this.provider.metadata.name, deliveryId: result.deliveryId }
    );

    if (result.events.length > 0) {
      await this.onEvent(result.events);
    }
  }
}
