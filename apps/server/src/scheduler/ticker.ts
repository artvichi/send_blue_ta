import { prisma } from '../db/prisma.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { getSettings } from '../repositories/settings.js';
import { lastDispatchedAt, reapExpiredLeases } from '../repositories/message-queue.js';
import { resolvePolicy } from '../domain/policies/index.js';
import { fixedIntervalLimiter } from './rate-limit.js';

/**
 * The scheduler is two independent loops.
 *
 * Neither of them claims work. The ticker exists only to decide whether the
 * queue is *due*; the actual claim happens when a gateway asks for a lease.
 * That inversion is deliberate -- work is never handed to a gateway that is not
 * there to receive it, so an offline gateway cannot consume interval slots.
 */
export class Scheduler {
  private tickTimer: NodeJS.Timeout | null = null;
  private reapTimer: NodeJS.Timeout | null = null;
  private reaping = false;

  start(): void {
    const { TICK_INTERVAL_MS, REAP_INTERVAL_MS } = env();

    // `unref` so a pending timer never keeps the process alive during shutdown.
    this.reapTimer = setInterval(() => void this.reap(), REAP_INTERVAL_MS);
    this.reapTimer.unref();

    this.tickTimer = setInterval(() => void this.logDueState(), TICK_INTERVAL_MS * 30);
    this.tickTimer.unref();

    logger.info(
      { reapIntervalMs: REAP_INTERVAL_MS },
      'scheduler started (lease reaper active; claims are gateway-driven)',
    );
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.reapTimer) clearInterval(this.reapTimer);
    this.tickTimer = null;
    this.reapTimer = null;
  }

  /**
   * Return expired leases to the queue. Guarded against overlap so a slow sweep
   * cannot stack up behind itself.
   */
  async reap(): Promise<number> {
    if (this.reaping) return 0;
    this.reaping = true;
    try {
      const count = await reapExpiredLeases(new Date(), prisma);
      if (count > 0) logger.warn({ count }, 'reclaimed expired leases');
      return count;
    } catch (err) {
      logger.error({ err }, 'lease reaper failed');
      return 0;
    } finally {
      this.reaping = false;
    }
  }

  private async logDueState(): Promise<void> {
    try {
      const state = await queueState();
      logger.debug(state, 'queue state');
    } catch (err) {
      logger.error({ err }, 'failed to read queue state');
    }
  }
}

/** Everything needed to decide whether a lease may be granted right now. */
export async function queueState() {
  const now = new Date();
  const settings = await getSettings();
  const last = await lastDispatchedAt();
  const input = { lastDispatchedAt: last, intervalSeconds: settings.sendIntervalSeconds, now };

  return {
    now,
    settings,
    policy: resolvePolicy(settings.policy),
    lastDispatchedAt: last,
    due: !settings.paused && fixedIntervalLimiter.canSendNow(input),
    msUntilNext: fixedIntervalLimiter.msUntilNext(input),
    etaInput: input,
  };
}

export const scheduler = new Scheduler();
