import { describe, it, expect } from 'vitest';
import { resolvePolicy, policyNames, fifoPolicy, timestampedPolicy } from './index.js';

describe('policy registry', () => {
  it('defaults to FIFO for an unknown or missing name', () => {
    expect(resolvePolicy(undefined).name).toBe('FIFO');
    expect(resolvePolicy(null).name).toBe('FIFO');
    expect(resolvePolicy('NOT_A_POLICY').name).toBe('FIFO');
  });

  it('resolves each registered policy by name', () => {
    expect(resolvePolicy('FIFO')).toBe(fifoPolicy);
    expect(resolvePolicy('TIMESTAMPED')).toBe(timestampedPolicy);
  });

  it('advertises what is available, for the settings endpoint', () => {
    expect(policyNames()).toEqual(expect.arrayContaining(['FIFO', 'TIMESTAMPED']));
  });
});

describe('FIFO policy', () => {
  it('treats every queued message as eligible', () => {
    // Ordering is FIFO's only concern; whether *now* is an allowed moment is the
    // rate limiter's job. Keeping the two apart is what makes each replaceable.
    expect(fifoPolicy.eligibility(new Date()).strings.join('')).toContain('TRUE');
  });

  it('orders by queueSeq, and lets a send-now override jump the queue', () => {
    const sql = fifoPolicy.ordering().strings.join('');
    expect(sql).toContain('queueSeq');
    expect(sql).toContain('forceDispatch');
  });

  it('does not order by createdAt, which can tie', () => {
    expect(fifoPolicy.ordering().strings.join('')).not.toContain('createdAt');
  });
});

describe('TIMESTAMPED policy', () => {
  it('gates on scheduledAt while treating null as send-as-soon-as-possible', () => {
    const fragment = timestampedPolicy.eligibility(new Date());
    const sql = fragment.strings.join('');
    expect(sql).toContain('scheduledAt');
    expect(sql).toContain('IS NULL');
  });

  it('orders by scheduled time, then priority, then arrival', () => {
    const sql = timestampedPolicy.ordering().strings.join('');
    expect(sql.indexOf('scheduledAt')).toBeLessThan(sql.indexOf('priority'));
    expect(sql.indexOf('priority')).toBeLessThan(sql.indexOf('queueSeq'));
  });
});
