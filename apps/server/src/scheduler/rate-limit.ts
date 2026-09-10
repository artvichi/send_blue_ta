import { isDue, msUntilDue, type EtaInput } from '@sb/shared';

/**
 * Whether the queue may release a message now. Deliberately separate from
 * ordering, so either can change without disturbing the other.
 *
 * A pure function of persisted state -- last dispatch timestamp and the settings
 * row, nothing in memory -- which is why a restart can neither burn an interval
 * slot nor double-spend one.
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
