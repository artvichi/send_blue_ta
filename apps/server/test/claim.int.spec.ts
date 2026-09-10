import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, resetDatabase, seedMessages } from './helpers.js';
import { claimNextMessage, reapExpiredLeases } from '../src/repositories/message-queue.js';
import { fifoPolicy } from '../src/domain/policies/index.js';

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
});
beforeEach(resetDatabase);
afterAll(async () => {
  await db.$disconnect();
});

describe('claimNextMessage', () => {
  it('takes the oldest queued message first', async () => {
    const seeded = await seedMessages(3);

    const claimed = await claimNextMessage(fifoPolicy, new Date(), 120, db);

    expect(claimed?.id).toBe(seeded[0]!.id);
  });

  it('drains in strict FIFO order', async () => {
    const seeded = await seedMessages(4);

    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const claimed = await claimNextMessage(fifoPolicy, new Date(), 120, db);
      if (claimed) order.push(claimed.id);
    }

    expect(order).toEqual(seeded.map((m) => m.id));
  });

  it('returns null when the queue is empty', async () => {
    expect(await claimNextMessage(fifoPolicy, new Date(), 120, db)).toBeNull();
  });

  /**
   * The property the whole design rests on. Without SKIP LOCKED, concurrent
   * claims either block on one another or hand the same row to two callers --
   * and handing the same row out twice means texting a real person twice.
   */
  it('never hands the same message to two concurrent claimers', async () => {
    await seedMessages(5);

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimNextMessage(fifoPolicy, new Date(), 120, db)),
    );

    const ids = claims.filter((c) => c !== null).map((c) => c!.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it('hands out no more than the queue holds, under contention', async () => {
    await seedMessages(2);

    const claims = await Promise.all(
      Array.from({ length: 6 }, () => claimNextMessage(fifoPolicy, new Date(), 120, db)),
    );

    expect(claims.filter((c) => c !== null)).toHaveLength(2);
    expect(claims.filter((c) => c === null)).toHaveLength(4);
  });

  it('marks the claim as leased and counts the attempt', async () => {
    const [seeded] = await seedMessages(1);
    const now = new Date();

    const claimed = await claimNextMessage(fifoPolicy, now, 120, db);

    const row = await db.message.findUniqueOrThrow({ where: { id: seeded!.id } });
    expect(row.status).toBe('DISPATCHING');
    expect(row.attempts).toBe(1);
    expect(row.dispatchToken).toBe(claimed!.dispatchToken);
    expect(row.leaseExpiresAt!.getTime()).toBeCloseTo(now.getTime() + 120_000, -3);
  });

  it('records a DISPATCHING event on the timeline', async () => {
    const [seeded] = await seedMessages(1);
    await claimNextMessage(fifoPolicy, new Date(), 120, db);

    const events = await db.messageEvent.findMany({ where: { messageId: seeded!.id } });
    expect(events.map((e) => e.status)).toContain('DISPATCHING');
  });

  it('clears a send-now override so it fires exactly once', async () => {
    const [seeded] = await seedMessages(1);
    await db.message.update({ where: { id: seeded!.id }, data: { forceDispatch: true } });

    await claimNextMessage(fifoPolicy, new Date(), 120, db);

    const row = await db.message.findUniqueOrThrow({ where: { id: seeded!.id } });
    expect(row.forceDispatch).toBe(false);
  });

  it('lets a send-now override jump ahead of older messages', async () => {
    const seeded = await seedMessages(3);
    await db.message.update({ where: { id: seeded[2]!.id }, data: { forceDispatch: true } });

    const claimed = await claimNextMessage(fifoPolicy, new Date(), 120, db);

    expect(claimed?.id).toBe(seeded[2]!.id);
  });
});

describe('reapExpiredLeases', () => {
  it('returns an abandoned lease to the queue', async () => {
    const [seeded] = await seedMessages(1);
    await claimNextMessage(fifoPolicy, new Date(), 120, db);

    // Simulate a gateway that took the work and died.
    await db.message.update({
      where: { id: seeded!.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    const reaped = await reapExpiredLeases(new Date(), db);

    expect(reaped).toBe(1);
    const row = await db.message.findUniqueOrThrow({ where: { id: seeded!.id } });
    expect(row.status).toBe('QUEUED');
    expect(row.dispatchToken).toBeNull();
  });

  it('leaves a live lease alone', async () => {
    await seedMessages(1);
    await claimNextMessage(fifoPolicy, new Date(), 120, db);

    expect(await reapExpiredLeases(new Date(), db)).toBe(0);
  });

  it('makes a reaped message claimable again', async () => {
    const [seeded] = await seedMessages(1);
    await claimNextMessage(fifoPolicy, new Date(), 120, db);
    await db.message.update({
      where: { id: seeded!.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    await reapExpiredLeases(new Date(), db);

    const reclaimed = await claimNextMessage(fifoPolicy, new Date(), 120, db);

    expect(reclaimed?.id).toBe(seeded!.id);
    const row = await db.message.findUniqueOrThrow({ where: { id: seeded!.id } });
    expect(row.attempts).toBe(2);
  });

  /**
   * A message that was actually sent, but whose status report was lost, must not
   * be sent again. The GUID survives the reap and travels with the next lease so
   * the gateway can refuse to re-send.
   */
  it('preserves the provider GUID across a reap, protecting the double-send guard', async () => {
    const [seeded] = await seedMessages(1);
    await claimNextMessage(fifoPolicy, new Date(), 120, db);
    await db.message.update({
      where: { id: seeded!.id },
      data: { providerGuid: 'guid-already-sent', leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    await reapExpiredLeases(new Date(), db);
    const reclaimed = await claimNextMessage(fifoPolicy, new Date(), 120, db);

    expect(reclaimed?.providerGuid).toBe('guid-already-sent');
  });
});
