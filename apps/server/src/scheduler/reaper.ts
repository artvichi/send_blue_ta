import { prisma } from '../db/prisma.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { reapExpiredLeases } from '../repositories/message-queue.js';
import { queueState } from './queue-state.js';

/**
 * The only timer in the server.
 *
 * It does not claim work. A message leaves the queue only when a gateway asks
 * for one, so an offline gateway cannot consume interval slots. What runs on a
 * clock is recovery: returning expired leases to the queue after a gateway
 * died mid-dispatch. This is where delivery reliability lives.
 */
export interface Reaper {
  stop(): void;
  /** Exposed so a test can drive a sweep without waiting on the timer. */
  sweep(): Promise<number>;
}

export function startReaper(): Reaper {
  const { TICK_INTERVAL_MS, REAP_INTERVAL_MS } = env();
  const sweep = overlapGuard(reapOnce);

  // `unref` so a pending timer never keeps the process alive during shutdown.
  const reapTimer = setInterval(() => void sweep(), REAP_INTERVAL_MS);
  reapTimer.unref();

  const stateTimer = setInterval(() => void logQueueState(), TICK_INTERVAL_MS * 30);
  stateTimer.unref();

  logger.info(
    { reapIntervalMs: REAP_INTERVAL_MS },
    'reaper started (claims are gateway-driven; nothing here dispatches)',
  );

  return {
    sweep,
    stop() {
      clearInterval(reapTimer);
      clearInterval(stateTimer);
    },
  };
}

async function reapOnce(): Promise<number> {
  try {
    const count = await reapExpiredLeases(new Date(), prisma);
    if (count > 0) logger.warn({ count }, 'reclaimed expired leases');
    return count;
  } catch (err) {
    logger.error({ err }, 'lease reaper failed');
    return 0;
  }
}

/**
 * A slow sweep must not stack up behind itself: while one is in progress, the
 * next tick is a no-op rather than a second concurrent sweep.
 */
export function overlapGuard(run: () => Promise<number>): () => Promise<number> {
  let inFlight: Promise<number> | null = null;
  return () => {
    if (inFlight) return Promise.resolve(0);
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

async function logQueueState(): Promise<void> {
  try {
    logger.debug(await queueState(), 'queue state');
  } catch (err) {
    logger.error({ err }, 'failed to read queue state');
  }
}
