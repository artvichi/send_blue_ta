import { isDue, msUntilDue, type EtaInput } from '@sb/shared';

/**
 * Whether the queue may release a message right now.
 *
 * Kept separate from the scheduling policy on purpose: ordering and drain rate
 * are independent questions, and keeping them independent is what lets either
 * change without disturbing the other.
 *
 * The gate is a pure function of persisted state -- the last dispatch timestamp
 * read from the database and the interval read from the settings row. Nothing
 * is held in memory, which is precisely why a restart can neither burn an
 * interval slot nor double-spend one.
 */
export interface RateLimiter {
  readonly name: string;
  canSendNow(input: EtaInput): boolean;
  msUntilNext(input: EtaInput): number;
}

export const fixedIntervalLimiter: RateLimiter = {
  name: 'FIXED_INTERVAL',
  canSendNow: isDue,
  msUntilNext: msUntilDue,
};
