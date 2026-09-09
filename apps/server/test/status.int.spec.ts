import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, resetDatabase, seedMessages } from './helpers.js';
import {
  applyStatusReport,
  cancelMessage,
  claimNextMessage,
  retryMessage,
} from '../src/repositories/messages.js';
import { fifoPolicy } from '../src/domain/policies/index.js';

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
});
beforeEach(resetDatabase);
afterAll(async () => {
  await db.$disconnect();
});

async function claimOne() {
  await seedMessages(1);
  const claimed = await claimNextMessage(fifoPolicy, new Date(), 120, db);
  if (!claimed) throw new Error('expected a claim');
  return claimed;
}

describe('applyStatusReport', () => {
  it('advances through the lifecycle and stamps each timestamp', async () => {
    const claimed = await claimOne();
    const base = { messageId: claimed.id, dispatchToken: claimed.dispatchToken };

    for (const status of ['ACCEPTED', 'SENT', 'DELIVERED', 'RECEIVED'] as const) {
      const result = await applyStatusReport(
        { ...base, status, occurredAt: new Date() },
        db,
      );
      expect(result.outcome, `expected ${status} to apply`).toBe('applied');
    }

    const row = await db.message.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe('RECEIVED');
    expect(row.sentAt).not.toBeNull();
    expect(row.deliveredAt).not.toBeNull();
    expect(row.receivedAt).not.toBeNull();
  });

  it('ignores a report carrying a stale dispatch token', async () => {
    const claimed = await claimOne();

    const result = await applyStatusReport(
      {
        messageId: claimed.id,
        dispatchToken: 'a-token-from-an-attempt-that-no-longer-exists',
        status: 'SENT',
        occurredAt: new Date(),
      },
      db,
    );

    expect(result).toMatchObject({ outcome: 'ignored', reason: 'stale-token' });
  });

  it('ignores a status that would walk backwards', async () => {
    const claimed = await claimOne();
    const base = { messageId: claimed.id, dispatchToken: claimed.dispatchToken };

    await applyStatusReport({ ...base, status: 'DELIVERED', occurredAt: new Date() }, db);
    // The SENT poll lost the race with the DELIVERED poll behind it.
    const late = await applyStatusReport({ ...base, status: 'SENT', occurredAt: new Date() }, db);

    expect(late).toMatchObject({ outcome: 'ignored', reason: 'no-transition' });
    const row = await db.message.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe('DELIVERED');
  });

  it('is idempotent under redelivery', async () => {
    const claimed = await claimOne();
    const base = { messageId: claimed.id, dispatchToken: claimed.dispatchToken };

    await applyStatusReport({ ...base, status: 'DELIVERED', occurredAt: new Date() }, db);
    await applyStatusReport({ ...base, status: 'DELIVERED', occurredAt: new Date() }, db);

    const events = await db.messageEvent.findMany({
      where: { messageId: claimed.id, status: 'DELIVERED' },
    });
    expect(events).toHaveLength(1);
  });

  it('records the GUID once and never overwrites it', async () => {
    const claimed = await claimOne();
    const base = { messageId: claimed.id, dispatchToken: claimed.dispatchToken };

    await applyStatusReport(
      { ...base, status: 'SENT', occurredAt: new Date(), providerGuid: 'guid-first' },
      db,
    );
    await applyStatusReport(
      { ...base, status: 'DELIVERED', occurredAt: new Date(), providerGuid: 'guid-second' },
      db,
    );

    const row = await db.message.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.providerGuid).toBe('guid-first');
  });

  it('captures the error text on failure', async () => {
    const claimed = await claimOne();

    await applyStatusReport(
      {
        messageId: claimed.id,
        dispatchToken: claimed.dispatchToken,
        status: 'FAILED',
        occurredAt: new Date(),
        error: 'osascript send failed: no iMessage account',
      },
      db,
    );

    const row = await db.message.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe('FAILED');
    expect(row.lastError).toContain('no iMessage account');
  });

  it('reports a missing message rather than throwing', async () => {
    const result = await applyStatusReport(
      {
        messageId: '00000000-0000-0000-0000-000000000000',
        dispatchToken: 'x',
        status: 'SENT',
        occurredAt: new Date(),
      },
      db,
    );
    expect(result).toMatchObject({ outcome: 'ignored', reason: 'not-found' });
  });
});

describe('cancelMessage', () => {
  it('cancels a queued message', async () => {
    const [seeded] = await seedMessages(1);
    expect(await cancelMessage(seeded!.id, db)).toMatchObject({ ok: true });

    const row = await db.message.findUniqueOrThrow({ where: { id: seeded!.id } });
    expect(row.status).toBe('CANCELED');
  });

  it('refuses once the gateway holds it, because the send may already have happened', async () => {
    const claimed = await claimOne();
    const result = await cancelMessage(claimed.id, db);
    expect(result).toMatchObject({ ok: false, reason: 'not-cancelable' });
  });
});

describe('retryMessage', () => {
  it('requeues a failed message and clears the previous attempt', async () => {
    const claimed = await claimOne();
    await applyStatusReport(
      {
        messageId: claimed.id,
        dispatchToken: claimed.dispatchToken,
        status: 'FAILED',
        occurredAt: new Date(),
        error: 'boom',
      },
      db,
    );

    expect(await retryMessage(claimed.id, db)).toMatchObject({ ok: true });

    const row = await db.message.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe('QUEUED');
    expect(row.dispatchToken).toBeNull();
    expect(row.lastError).toBeNull();
    // Cleared so the double-send guard does not immediately veto the new attempt.
    expect(row.providerGuid).toBeNull();
  });

  it('refuses to retry anything that did not fail', async () => {
    const [seeded] = await seedMessages(1);
    expect(await retryMessage(seeded!.id, db)).toMatchObject({ ok: false, reason: 'not-failed' });
  });

  it('makes a retried message claimable again', async () => {
    const claimed = await claimOne();
    await applyStatusReport(
      {
        messageId: claimed.id,
        dispatchToken: claimed.dispatchToken,
        status: 'FAILED',
        occurredAt: new Date(),
      },
      db,
    );
    await retryMessage(claimed.id, db);

    const reclaimed = await claimNextMessage(fifoPolicy, new Date(), 120, db);
    expect(reclaimed?.id).toBe(claimed.id);
  });
});
