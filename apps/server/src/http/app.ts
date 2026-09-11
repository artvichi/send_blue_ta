import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { messagesRouter } from './routes/messages.js';
import { gatewayRouter } from './routes/gateway.js';
import { settingsRouter } from './routes/settings.js';
import { recipientsRouter } from './routes/recipients.js';
import { systemRouter } from './routes/system.js';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env().CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '128kb' }));

  // Health checks sit outside the rate limiter so a probe can never be throttled.
  app.use(healthRouter);

  /**
   * Public routes are rate limited; gateway routes are not. The gateway holds a
   * shared secret and long-polls continuously by design, so throttling it would
   * throttle the queue itself.
   */
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => req.path.startsWith('/gateway'),
    }),
  );

  app.use('/api/gateway', gatewayRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/recipients', recipientsRouter);
  app.use('/api', systemRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
