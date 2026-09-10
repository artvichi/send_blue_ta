import { Router } from 'express';
import { heartbeatSchema, reportStatusSchema, type LeaseDto } from '@sb/shared';
import { asyncRoute } from '../middleware/error-handler.js';
import { pathParam } from '../params.js';
import { validateBody } from '../middleware/validate.js';
import { requireGatewayAuth } from '../middleware/gateway-auth.js';
import { notFound } from '../errors.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { claimNextMessage, hasForcedMessage } from '../../repositories/message-queue.js';
import { applyStatusReport } from '../../repositories/message-status.js';
import { queueState } from '../../scheduler/ticker.js';

export const gatewayRouter = Router();

gatewayRouter.use(requireGatewayAuth);

const LEASE_POLL_INTERVAL_MS = 500;
const MAX_WAIT_SECONDS = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Long-poll for the next message. The gateway dials out; the server never
 * reaches into it, which is what lets it sit behind NAT -- and what makes the
 * AWS topology work, where the Mac is not in the VPC.
 *
 * Claiming happens here, on request, not on a timer: an offline gateway cannot
 * consume interval slots, because if nobody asks nothing leaves the queue.
 */
gatewayRouter.get(
  '/lease',
  asyncRoute(async (req, res) => {
    const requested = Number(req.query.wait ?? 25);
    const waitSeconds = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 0), MAX_WAIT_SECONDS)
      : 25;
    const deadline = Date.now() + waitSeconds * 1000;

    // Stop the moment the gateway hangs up, so a dead client holds no connection.
    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    do {
      const state = await queueState();
      const forced = await hasForcedMessage();

      if (!state.settings.paused && (state.due || forced)) {
        const claimed = await claimNextMessage(
          state.policy,
          new Date(),
          env().LEASE_SECONDS,
          prisma,
        );

        if (claimed) {
          logger.info(
            { messageId: claimed.id, forced, attempt: true },
            'lease granted to gateway',
          );
          const lease: LeaseDto = {
            messageId: claimed.id,
            dispatchToken: claimed.dispatchToken,
            to: claimed.toHandle,
            body: claimed.body,
            leaseExpiresAt: claimed.leaseExpiresAt.toISOString(),
            // Non-null means a previous attempt already sent this message and
            // only the status report was lost. The gateway must not re-send.
            providerGuid: claimed.providerGuid,
          };
          res.json(lease);
          return;
        }
      }

      if (Date.now() >= deadline || aborted) break;
      await sleep(LEASE_POLL_INTERVAL_MS);
    } while (!aborted);

    // 204, not an empty 200: there is genuinely nothing, and the gateway re-asks.
    res.status(204).end();
  }),
);

/**
 * Duplicated, out-of-order and stale reports are all handled in
 * `applyStatusReport` and all answer 202: the gateway did nothing wrong, and
 * retrying would not help.
 */
gatewayRouter.post(
  '/messages/:id/status',
  validateBody(reportStatusSchema),
  asyncRoute(async (req, res) => {
    const id = pathParam(req, 'id');
    const body = req.body as {
      dispatchToken: string;
      status: Parameters<typeof applyStatusReport>[0]['status'];
      providerGuid?: string;
      occurredAt: Date;
      error?: string;
    };

    const result = await applyStatusReport({
      messageId: id,
      dispatchToken: body.dispatchToken,
      status: body.status,
      occurredAt: body.occurredAt,
      providerGuid: body.providerGuid,
      error: body.error,
    });

    if (result.outcome === 'ignored' && result.reason === 'not-found') {
      throw notFound('No message with that id');
    }

    if (result.outcome === 'applied') {
      logger.info({ messageId: id, status: result.status }, 'status applied');
    } else {
      logger.debug(
        { messageId: id, reported: body.status, reason: result.reason },
        'status report ignored',
      );
    }

    res.status(202).json(result);
  }),
);

/** The server never connects out, so liveness means "asked for work recently". */
gatewayRouter.post(
  '/heartbeat',
  validateBody(heartbeatSchema),
  asyncRoute(async (req, res) => {
    const { gatewayId, driver, version } = req.body as {
      gatewayId: string;
      driver: string;
      version: string;
    };

    await prisma.gatewayHeartbeat.upsert({
      where: { id: gatewayId },
      update: { driver, version, lastSeenAt: new Date() },
      create: { id: gatewayId, driver, version },
    });

    res.status(204).end();
  }),
);
