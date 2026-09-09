import { describe, it, expect } from 'vitest';
import { fixedIntervalLimiter } from './rate-limit.js';

const now = new Date('2026-01-01T12:00:00.000Z');
const HOUR = 3600;

describe('fixedIntervalLimiter', () => {
  it('permits the first send when nothing has ever been dispatched', () => {
    expect(
      fixedIntervalLimiter.canSendNow({ lastDispatchedAt: null, intervalSeconds: HOUR, now }),
    ).toBe(true);
  });

  it('holds inside the interval', () => {
    expect(
      fixedIntervalLimiter.canSendNow({
        lastDispatchedAt: new Date('2026-01-01T11:59:59.000Z'),
        intervalSeconds: HOUR,
        now,
      }),
    ).toBe(false);
  });

  it('permits exactly on the boundary', () => {
    expect(
      fixedIntervalLimiter.canSendNow({
        lastDispatchedAt: new Date('2026-01-01T11:00:00.000Z'),
        intervalSeconds: HOUR,
        now,
      }),
    ).toBe(true);
  });

  it('does not try to catch up after a long idle period', () => {
    // Idle for six hours does not mean six messages are owed. The gate is a
    // boolean about *now*, not a backlog of unspent slots.
    const input = {
      lastDispatchedAt: new Date('2026-01-01T06:00:00.000Z'),
      intervalSeconds: HOUR,
      now,
    };
    expect(fixedIntervalLimiter.canSendNow(input)).toBe(true);
    expect(fixedIntervalLimiter.msUntilNext(input)).toBe(0);
  });

  it('reports the remaining wait', () => {
    expect(
      fixedIntervalLimiter.msUntilNext({
        lastDispatchedAt: new Date('2026-01-01T11:40:00.000Z'),
        intervalSeconds: HOUR,
        now,
      }),
    ).toBe(40 * 60 * 1000);
  });

  it('derives entirely from persisted state, so a restart changes nothing', () => {
    // Nothing here reads process memory: the same inputs produce the same answer
    // whether the server has been up for a week or started a millisecond ago.
    const input = {
      lastDispatchedAt: new Date('2026-01-01T11:30:00.000Z'),
      intervalSeconds: HOUR,
      now,
    };
    const before = fixedIntervalLimiter.canSendNow(input);
    const afterRestart = fixedIntervalLimiter.canSendNow({ ...input });
    expect(before).toBe(afterRestart);
    expect(before).toBe(false);
  });
});
