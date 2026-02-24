import type { Request, Response } from 'express';
import type { IProvider, EventHandler } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class WebhookHandler {
  constructor(
    private readonly provider: IProvider,
    private readonly eventHandler: EventHandler
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

      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      const isValid = await this.provider.validateWebhook(
        req.headers,
        req.body,
        rawBody
      );

      if (!isValid) {
        logger.warn(
          'Webhook validation failed',
          { provider: this.provider.metadata.name }
        );
        res.status(401).json({ error: 'Invalid webhook' });
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
    await this.provider.handleWebhook(headers, body, this.eventHandler);
  }
}
