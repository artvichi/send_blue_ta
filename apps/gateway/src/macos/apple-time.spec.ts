import { describe, it, expect } from 'vitest';
import { appleTimeToDate, dateToAppleNs, sqlLiteral } from './apple-time.js';

/**
 * Apple's timestamps are the single easiest thing to get wrong when reading
 * chat.db: they are nanoseconds since 2001-01-01, not a Unix epoch. Getting the
 * offset wrong shifts every delivery time by 31 years.
 */
describe('appleTimeToDate', () => {
  it('converts nanoseconds since the 2001 epoch', () => {
    // A realistic modern value: chat.db nanosecond timestamps are ~8e17. The
    // 1e11 threshold sits far above any plausible seconds value and far below
    // any plausible nanoseconds one, so the two are never confused in practice.
    const ns = 776_000_000_000_000_000;
    expect(appleTimeToDate(ns)?.toISOString()).toBe('2025-08-04T11:33:20.000Z');
  });

  it('handles a realistic modern timestamp', () => {
    const date = new Date('2026-09-09T12:00:00.000Z');
    const roundTripped = appleTimeToDate(dateToAppleNs(date));
    expect(roundTripped?.toISOString()).toBe(date.toISOString());
  });

  it('falls back to seconds for very old rows', () => {
    // Pre-High Sierra rows stored seconds, not nanoseconds. The magnitude is
    // what distinguishes them.
    expect(appleTimeToDate(1)?.toISOString()).toBe('2001-01-01T00:00:01.000Z');
  });

  it('treats null and zero as absent', () => {
    expect(appleTimeToDate(null)).toBeNull();
    expect(appleTimeToDate(0)).toBeNull();
  });

  it('round-trips through dateToAppleNs', () => {
    const now = new Date('2026-03-04T05:06:07.000Z');
    expect(appleTimeToDate(dateToAppleNs(now))!.getTime()).toBe(now.getTime());
  });
});

describe('sqlLiteral', () => {
  it('quotes a plain value', () => {
    expect(sqlLiteral('abc')).toBe("'abc'");
  });

  it('escapes embedded single quotes', () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it('neutralizes an attempted injection', () => {
    const hostile = "'; DROP TABLE message; --";
    expect(sqlLiteral(hostile)).toBe("'''; DROP TABLE message; --'");
  });
});
