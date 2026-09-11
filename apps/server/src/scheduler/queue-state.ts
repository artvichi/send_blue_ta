import { getSettings } from '../repositories/settings.js';
import { lastDispatchedAt } from '../repositories/message-queue.js';
import { resolvePolicy } from '../domain/policies/index.js';
import { fixedIntervalLimiter } from './rate-limit.js';

/**
 * Everything needed to decide whether a lease may be granted right now.
 *
 * Read fresh on every call, never cached: the rate gate must derive from
 * persisted timestamps so that a restart cannot burn or double-spend a slot.
 */
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

export type QueueState = Awaited<ReturnType<typeof queueState>>;
