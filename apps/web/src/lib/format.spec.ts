import { describe, it, expect } from 'vitest';
import { formatAgo, formatCountdown, formatInterval } from './format';

const T0 = Date.parse('2026-01-01T12:00:00Z');
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

describe('formatCountdown', () => {
  it('says "now" once the moment has passed', () => {
    expect(formatCountdown(at(-1), T0)).toBe('now');
    expect(formatCountdown(at(0), T0)).toBe('now');
  });

  it('shows seconds only when they matter', () => {
    expect(formatCountdown(at(8_000), T0)).toBe('in 8s');
    expect(formatCountdown(at(2 * 60_000 + 30_000), T0)).toBe('in 2m 30s');
    // Past five minutes the seconds are noise.
    expect(formatCountdown(at(45 * 60_000 + 30_000), T0)).toBe('in 45m');
  });

  it('rolls up to hours and days', () => {
    expect(formatCountdown(at(3 * 3_600_000 + 5 * 60_000), T0)).toBe('in 3h 5m');
    expect(formatCountdown(at(26 * 3_600_000), T0)).toBe('in 1d 2h');
  });

  it('handles a missing value', () => {
    expect(formatCountdown(null)).toBe('--');
  });
});

describe('formatAgo', () => {
  it('is the mirror of the countdown', () => {
    expect(formatAgo(at(-500), T0)).toBe('just now');
    expect(formatAgo(at(-8_000), T0)).toBe('8s ago');
    expect(formatAgo(at(-3 * 60_000), T0)).toBe('3m ago');
    expect(formatAgo(at(-5 * 3_600_000), T0)).toBe('5h ago');
    expect(formatAgo(at(-49 * 3_600_000), T0)).toBe('2d ago');
  });

  it('says never when nothing has happened', () => {
    expect(formatAgo(null)).toBe('never');
  });
});

describe('formatInterval', () => {
  it('picks the unit a person would', () => {
    expect(formatInterval(1)).toBe('1 second');
    expect(formatInterval(10)).toBe('10 seconds');
    expect(formatInterval(60)).toBe('1 minute');
    expect(formatInterval(900)).toBe('15 minutes');
    expect(formatInterval(3600)).toBe('1 hour');
    expect(formatInterval(5400)).toBe('1.5 hours');
  });
});
