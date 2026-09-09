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
import { claimNextMessage, applyStatusReport, hasForcedMessage } from '../../repositories/messages.js';
import { queueState } from '../../scheduler/ticker.js';

export const gatewayRouter = Router();

gatewayRouter.use(requireGatewayAuth);

const LEASE_POLL_INTERVAL_MS = 500;
const MAX_WAIT_SECONDS = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Long-poll for the next message to send.
 *
 * The gateway dials out and asks; the server never reaches into the gateway.
 * That direction is what lets the gateway sit on a laptop behind NAT with no
 * inbound rules -- and it is the same property that makes the production
 * topology work, where the backend is in AWS and the Mac is not.
 *
 * Claiming happens *here*, on request, rather than on a timer. An offline
 * gateway therefore cannot consume interval slots: if nobody asks, nothing
 * leaves the queue, and the hour is still there when the gateway returns.
 */
gatewayRouter.get(
  '/lease',
  asyncRoute(async (req, res) => {
    const requested = Number(req.query.wait ?? 25);
    const waitSeconds = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 0), MAX_WAIT_SECONDS)
      : 25;
    const deadline = Date.now() + waitSeconds * 1000;

    // Stop looping the moment the gateway hangs up, so a disconnected client
    // does not keep a request alive holding a database connection.
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
            to: claimed.toE164,
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

    // 204 rather than an empty 200: there is genuinely no content, and the
    // gateway simply asks again.
    res.status(204).end();
  }),
);

/**
 * Report an observed status change.
 *
 * Reports arrive duplicated, out of order, and occasionally from an attempt
 * that no longer exists. All three are handled in `applyStatusReport`, and all
 * three return 202 rather than an error: the gateway did nothing wrong, and
 * making it retry would not help.
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

/**
 * Liveness. The server never connects to the gateway, so the only evidence the
 * gateway is alive is that it recently asked for work.
 */
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
