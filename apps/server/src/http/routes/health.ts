import { Router } from 'express';
import { prisma } from '../../db/prisma.js';

export const healthRouter = Router();

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
