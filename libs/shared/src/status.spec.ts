import { describe, it, expect } from 'vitest';
import {
  MESSAGE_STATUSES,
  canTransition,
  reconcileStatus,
  isTerminal,
  isSuccess,
  isInFlight,
  progressRank,
  type MessageStatus,
} from './status.js';

describe('status state machine', () => {
  it('advances along the happy path', () => {
    const path: MessageStatus[] = [
      'QUEUED',
      'DISPATCHING',
      'ACCEPTED',
      'SENT',
      'DELIVERED',
      'RECEIVED',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('allows skipping intermediate stages', () => {
    // chat.db polling can observe delivery before it ever reports the send.
    expect(canTransition('ACCEPTED', 'DELIVERED')).toBe(true);
    expect(canTransition('DISPATCHING', 'SENT')).toBe(true);
  });

  it('never regresses', () => {
    expect(canTransition('DELIVERED', 'SENT')).toBe(false);
    expect(canTransition('SENT', 'ACCEPTED')).toBe(false);
    expect(canTransition('RECEIVED', 'DELIVERED')).toBe(false);
  });

  it('rejects self-transitions, making duplicate reports harmless', () => {
    for (const s of MESSAGE_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it('locks terminal statuses', () => {
    for (const terminal of ['RECEIVED', 'FAILED', 'CANCELED'] as const) {
      for (const to of MESSAGE_STATUSES) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  it('only cancels from the queue', () => {
    expect(canTransition('QUEUED', 'CANCELED')).toBe(true);
    // Once the gateway holds it the send may already have happened.
    expect(canTransition('DISPATCHING', 'CANCELED')).toBe(false);
    expect(canTransition('ACCEPTED', 'CANCELED')).toBe(false);
    expect(canTransition('SENT', 'CANCELED')).toBe(false);
  });

  it('fails from any non-terminal status', () => {
    for (const s of ['QUEUED', 'DISPATCHING', 'ACCEPTED', 'SENT', 'DELIVERED'] as const) {
      expect(canTransition(s, 'FAILED')).toBe(true);
    }
  });

  it('never returns to QUEUED by transition (retry is an explicit operation)', () => {
    for (const s of MESSAGE_STATUSES) {
      expect(canTransition(s, 'QUEUED')).toBe(false);
    }
  });
});

describe('reconcileStatus', () => {
  it('applies a genuine advance', () => {
    expect(reconcileStatus('SENT', 'DELIVERED')).toBe('DELIVERED');
  });

  it('ignores a stale report arriving out of order', () => {
    // The SENT poll lost the race with the DELIVERED poll behind it.
    expect(reconcileStatus('DELIVERED', 'SENT')).toBe('DELIVERED');
  });

  it('is idempotent under redelivery', () => {
    expect(reconcileStatus('DELIVERED', 'DELIVERED')).toBe('DELIVERED');
  });

  it('does not resurrect a canceled message', () => {
    expect(reconcileStatus('CANCELED', 'SENT')).toBe('CANCELED');
  });
});

describe('status predicates', () => {
  it('classifies terminal states', () => {
    expect(isTerminal('RECEIVED')).toBe(true);
    expect(isTerminal('FAILED')).toBe(true);
    expect(isTerminal('CANCELED')).toBe(true);
    expect(isTerminal('DELIVERED')).toBe(false);
  });

  it('treats DELIVERED as success even though RECEIVED may never arrive', () => {
    expect(isSuccess('DELIVERED')).toBe(true);
    expect(isSuccess('RECEIVED')).toBe(true);
    expect(isSuccess('SENT')).toBe(false);
  });

  it('classifies in-flight states', () => {
    expect(isInFlight('DISPATCHING')).toBe(true);
    expect(isInFlight('SENT')).toBe(true);
    expect(isInFlight('QUEUED')).toBe(false);
    expect(isInFlight('DELIVERED')).toBe(false);
  });

  it('ranks the progression in order', () => {
    expect(progressRank('QUEUED')).toBeLessThan(progressRank('SENT'));
    expect(progressRank('SENT')).toBeLessThan(progressRank('RECEIVED'));
    expect(progressRank('FAILED')).toBe(-1);
  });
});
