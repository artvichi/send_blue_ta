import { describe, it, expect } from 'vitest';
import { projectAnchor, projectEta, projectQueueEtas, isDue, msUntilDue } from './eta.js';

const now = new Date('2026-01-01T12:00:00.000Z');
const HOUR = 3600;

describe('projectAnchor', () => {
  it('is now when nothing has ever been dispatched', () => {
    expect(projectAnchor({ lastDispatchedAt: null, intervalSeconds: HOUR, now })).toEqual(now);
  });

  it('is one interval after the last dispatch while still throttled', () => {
    const lastDispatchedAt = new Date('2026-01-01T11:30:00.000Z');
    expect(projectAnchor({ lastDispatchedAt, intervalSeconds: HOUR, now })).toEqual(
      new Date('2026-01-01T12:30:00.000Z'),
    );
  });

  it('collapses to now once the interval has already elapsed', () => {
    // A queue idle for three hours must not try to catch up on past slots.
    const lastDispatchedAt = new Date('2026-01-01T09:00:00.000Z');
    expect(projectAnchor({ lastDispatchedAt, intervalSeconds: HOUR, now })).toEqual(now);
  });
});

describe('projectEta', () => {
  it('places the head of the queue at the anchor', () => {
    expect(projectEta(0, { lastDispatchedAt: null, intervalSeconds: HOUR, now })).toEqual(now);
  });

  it('spaces subsequent messages one interval apart', () => {
    const input = { lastDispatchedAt: null, intervalSeconds: HOUR, now };
    expect(projectEta(1, input)).toEqual(new Date('2026-01-01T13:00:00.000Z'));
    expect(projectEta(3, input)).toEqual(new Date('2026-01-01T15:00:00.000Z'));
  });

  it('shifts the whole queue when the last dispatch was recent', () => {
    const lastDispatchedAt = new Date('2026-01-01T11:45:00.000Z');
    const input = { lastDispatchedAt, intervalSeconds: HOUR, now };
    expect(projectEta(0, input)).toEqual(new Date('2026-01-01T12:45:00.000Z'));
    expect(projectEta(1, input)).toEqual(new Date('2026-01-01T13:45:00.000Z'));
  });
});

describe('projectQueueEtas', () => {
  it('matches projectEta element for element', () => {
    const input = { lastDispatchedAt: null, intervalSeconds: HOUR, now };
    const etas = projectQueueEtas(4, input);
    expect(etas).toHaveLength(4);
    etas.forEach((eta, i) => expect(eta).toEqual(projectEta(i, input)));
  });

  it('returns nothing for an empty queue', () => {
    expect(projectQueueEtas(0, { lastDispatchedAt: null, intervalSeconds: HOUR, now })).toEqual([]);
  });

  it('recalculates when the interval changes at runtime', () => {
    const base = { lastDispatchedAt: null, now };
    const hourly = projectQueueEtas(3, { ...base, intervalSeconds: HOUR });
    const tenSecond = projectQueueEtas(3, { ...base, intervalSeconds: 10 });
    expect(hourly[2]).toEqual(new Date('2026-01-01T14:00:00.000Z'));
    expect(tenSecond[2]).toEqual(new Date('2026-01-01T12:00:20.000Z'));
  });
});

describe('isDue', () => {
  it('is due when nothing has been dispatched', () => {
    expect(isDue({ lastDispatchedAt: null, intervalSeconds: HOUR, now })).toBe(true);
  });

  it('is not due inside the interval', () => {
    const lastDispatchedAt = new Date('2026-01-01T11:59:00.000Z');
    expect(isDue({ lastDispatchedAt, intervalSeconds: HOUR, now })).toBe(false);
  });

  it('is due exactly on the boundary', () => {
    const lastDispatchedAt = new Date('2026-01-01T11:00:00.000Z');
    expect(isDue({ lastDispatchedAt, intervalSeconds: HOUR, now })).toBe(true);
  });

  it('survives a restart, because the gate reads a persisted timestamp', () => {
    // Nothing in this calculation depends on in-process state, so a process
    // that restarts mid-interval neither burns nor double-spends a slot.
    const lastDispatchedAt = new Date('2026-01-01T11:30:00.000Z');
    const input = { lastDispatchedAt, intervalSeconds: HOUR, now };
    expect(isDue(input)).toBe(false);
    expect(isDue({ ...input, now: new Date('2026-01-01T12:30:00.000Z') })).toBe(true);
  });
});

describe('msUntilDue', () => {
  it('is zero when already due', () => {
    expect(msUntilDue({ lastDispatchedAt: null, intervalSeconds: HOUR, now })).toBe(0);
  });

  it('counts down the remainder of the interval', () => {
    const lastDispatchedAt = new Date('2026-01-01T11:45:00.000Z');
    expect(msUntilDue({ lastDispatchedAt, intervalSeconds: HOUR, now })).toBe(45 * 60 * 1000);
  });
});
