import { describe, it, expect } from 'vitest';
import { overlapGuard } from './reaper.js';

describe('overlapGuard', () => {
  it('runs the sweep and returns its count', async () => {
    const sweep = overlapGuard(async () => 3);
    await expect(sweep()).resolves.toBe(3);
  });

  it('does not start a second sweep while one is in progress', async () => {
    let release!: () => void;
    let calls = 0;
    const sweep = overlapGuard(
      () =>
        new Promise<number>((resolve) => {
          calls += 1;
          release = () => resolve(1);
        }),
    );

    const first = sweep();
    const second = sweep(); // overlaps: must be a no-op, not a queued run
    release();

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(0);
    expect(calls).toBe(1);
  });

  it('allows the next sweep once the previous one has settled', async () => {
    let calls = 0;
    const sweep = overlapGuard(async () => ++calls);
    await sweep();
    await sweep();
    expect(calls).toBe(2);
  });

  it('releases the guard even when the sweep rejects', async () => {
    let fail = true;
    const sweep = overlapGuard(async () => {
      if (fail) throw new Error('db down');
      return 1;
    });
    await expect(sweep()).rejects.toThrow('db down');
    fail = false;
    await expect(sweep()).resolves.toBe(1);
  });
});
