import { Router } from 'express';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

export const healthRouter = Router();

/**
 * Something human at the API root.
 *
 * Opening `/` in a browser is the first thing anyone does, and a bare 404 there
 * reads as "the server is down" when it is in fact answering correctly. Say what
 * this is and where the UI lives.
 */
healthRouter.get('/', (_req, res) => {
  res.json({
    service: 'imessage-scheduler-api',
    status: 'ok',
    ui: env().CORS_ORIGIN.split(',')[0]?.trim(),
    endpoints: {
      health: ['/healthz', '/readyz'],
      messages: ['/api/messages', '/api/messages/queue', '/api/messages/:id'],
      settings: '/api/settings',
      stats: '/api/stats',
      gatewayHealth: '/api/system/gateway',
      gatewayProtocol: '/api/gateway/* (bearer token required)',
    },
  });
});

/** Liveness: the process is up. Deliberately touches nothing else. */
healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/** Readiness: the process can actually serve traffic, which means the database. */
healthRouter.get('/readyz', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not-ready', reason: 'database unreachable' });
  }
});
