import { Router } from 'express';
import type { GatewayHealthDto } from '@sb/shared';
import { asyncRoute } from '../middleware/error-handler.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { getStats } from '../../services/messages.js';
import { activityByHour } from '../../repositories/message-queue.js';

export const systemRouter = Router();

systemRouter.get(
  '/stats',
  asyncRoute(async (_req, res) => {
    res.json(await getStats());
  }),
);

/** Hourly outcomes for the dashboard chart. */
systemRouter.get(
  '/stats/activity',
  asyncRoute(async (req, res) => {
    const requested = Number(req.query.hours ?? 24);
    const hours = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 168) : 24;
    const buckets = await activityByHour(hours);
    res.json({
      hours,
      buckets: buckets.map((b) => ({ ...b, hour: b.hour.toISOString() })),
    });
  }),
);

/**
 * Gateway liveness, inferred rather than measured: the gateway dials out, so
 * "online" means it asked for work recently enough.
 *
 * Deliberately *not* under `/api/gateway`, which is the authenticated machine
 * protocol. This is the dashboard's read-only view of it, so the two live in
 * separate namespaces and the browser never needs the gateway token.
 */
systemRouter.get(
  '/system/gateway',
  asyncRoute(async (_req, res) => {
    const latest = await prisma.gatewayHeartbeat.findFirst({ orderBy: { lastSeenAt: 'desc' } });

    const online =
      !!latest && Date.now() - latest.lastSeenAt.getTime() < env().GATEWAY_OFFLINE_AFTER_MS;

    // The mock driver reports nothing, which is how the UI knows not to ask for
    // permissions that driver does not need.
    const fullDiskAccess = latest?.fullDiskAccess ?? null;
    const automation = latest?.automation ?? null;

    const health: GatewayHealthDto = {
      online,
      gatewayId: latest?.id ?? null,
      driver: latest?.driver ?? null,
      version: latest?.version ?? null,
      lastSeenAt: latest?.lastSeenAt.toISOString() ?? null,
      fullDiskAccess,
      automation,
      hostApp: latest?.hostApp ?? null,
      ready: online && fullDiskAccess !== false && automation !== false,
    };
    res.json(health);
  }),
);
