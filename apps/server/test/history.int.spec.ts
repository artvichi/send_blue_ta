import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { db, resetDatabase, seedMessages } from './helpers.js';
import { createApp } from '../src/http/app.js';
import { clearHistory, countClearable } from '../src/repositories/messages.js';
import { activityByRange } from '../src/repositories/message-queue.js';

/**
 * The parts of the dashboard that are easy to get subtly wrong: deleting the
 * wrong rows, an activity chart with holes in its axis, and gateway health
 * inferred from heartbeats.
 */
let app: Express;
const TOKEN = process.env.GATEWAY_TOKEN ?? 'dev-gateway-token-change-me';

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
  app = createApp();
});
beforeEach(resetDatabase);
afterAll(async () => {
  await db.$disconnect();
});

describe('clearHistory', () => {
  it('removes finished messages and leaves queued and in-flight work alone', async () => {
    const [queued, dispatching, delivered, failed, canceled] = await seedMessages(5);
    await db.message.update({ where: { id: dispatching!.id }, data: { status: 'DISPATCHING' } });
    await db.message.update({ where: { id: delivered!.id }, data: { status: 'DELIVERED' } });
    await db.message.update({ where: { id: failed!.id }, data: { status: 'FAILED' } });
    await db.message.update({ where: { id: canceled!.id }, data: { status: 'CANCELED' } });

    expect(await countClearable(db)).toBe(3);
    const result = await clearHistory(db);
    expect(result).toEqual({ deleted: 3, kept: 2 });

    const remaining = await db.message.findMany({ select: { id: true }, orderBy: { queueSeq: 'asc' } });
    expect(remaining.map((m) => m.id)).toEqual([queued!.id, dispatching!.id]);
  });

  it('cascades the timeline with the message', async () => {
    const [m] = await seedMessages(1);
    await db.message.update({ where: { id: m!.id }, data: { status: 'DELIVERED' } });
    await db.messageEvent.createMany({
      data: [
        { messageId: m!.id, status: 'QUEUED' },
        { messageId: m!.id, status: 'DELIVERED' },
      ],
    });

    await clearHistory(db);
    expect(await db.messageEvent.count()).toBe(0);
  });

  it('is exposed as DELETE /api/messages and reports what it kept', async () => {
    const [a, b] = await seedMessages(2);
    await db.message.update({ where: { id: a!.id }, data: { status: 'DELIVERED' } });
    const res = await request(app).delete('/api/messages').expect(200);
    expect(res.body).toEqual({ deleted: 1, kept: 1 });
    expect(await db.message.findUnique({ where: { id: b!.id } })).not.toBeNull();
  });
});

describe('activityByRange', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  it('fills every bucket so the time axis has no gaps', async () => {
    const { buckets, unit } = await activityByRange('24h', db);
    expect(unit).toBe('hour');
    expect(buckets).toHaveLength(24);
    for (let i = 1; i < buckets.length; i++) {
      const delta = buckets[i]!.bucket.getTime() - buckets[i - 1]!.bucket.getTime();
      expect(delta).toBe(3_600_000);
    }
  });

  it('buckets on dispatch time and classifies outcomes', async () => {
    const [delivered, failed, inFlight, neverSent] = await seedMessages(4);
    await db.message.update({
      where: { id: delivered!.id },
      data: { status: 'RECEIVED', dispatchedAt: hoursAgo(2) },
    });
    await db.message.update({
      where: { id: failed!.id },
      data: { status: 'FAILED', dispatchedAt: hoursAgo(2) },
    });
    await db.message.update({
      where: { id: inFlight!.id },
      data: { status: 'SENT', dispatchedAt: hoursAgo(0) },
    });
    // Still queued: no dispatchedAt, so it belongs to no bucket.
    void neverSent;

    const { buckets } = await activityByRange('24h', db);
    const totals = buckets.reduce(
      (acc, b) => ({
        delivered: acc.delivered + b.delivered,
        failed: acc.failed + b.failed,
        inFlight: acc.inFlight + b.inFlight,
      }),
      { delivered: 0, failed: 0, inFlight: 0 },
    );
    expect(totals).toEqual({ delivered: 1, failed: 1, inFlight: 1 });
  });

  it('uses day buckets for the longer ranges', async () => {
    expect((await activityByRange('7d', db)).unit).toBe('day');
    expect((await activityByRange('30d', db)).buckets).toHaveLength(30);
  });
});

describe('gateway health is inferred from heartbeats', () => {
  const beat = (body: Record<string, unknown>) =>
    request(app)
      .post('/api/gateway/heartbeat')
      .set('authorization', `Bearer ${TOKEN}`)
      .send({ gatewayId: 'gw-1', driver: 'applescript', version: '1.2.3', ...body });

  it('reports offline when no gateway has ever connected', async () => {
    const res = await request(app).get('/api/system/gateway').expect(200);
    expect(res.body.online).toBe(false);
    expect(res.body.ready).toBe(false);
    expect(res.body.gatewayId).toBeNull();
  });

  it('reports online and ready after a heartbeat with both permissions', async () => {
    await beat({ capabilities: { fullDiskAccess: true, automation: true, hostApp: 'Terminal' } }).expect(204);
    const res = await request(app).get('/api/system/gateway').expect(200);
    expect(res.body).toMatchObject({
      online: true,
      ready: true,
      driver: 'applescript',
      version: '1.2.3',
      hostApp: 'Terminal',
    });
  });

  it('is online but not ready while a permission is missing, and says which', async () => {
    await beat({ capabilities: { fullDiskAccess: true, automation: false, hostApp: 'Orca' } }).expect(204);
    const res = await request(app).get('/api/system/gateway').expect(200);
    expect(res.body).toMatchObject({ online: true, ready: false, automation: false, fullDiskAccess: true });
  });

  it('treats a driver that reports no capabilities as needing none', async () => {
    await beat({ driver: 'mock' }).expect(204);
    const res = await request(app).get('/api/system/gateway').expect(200);
    expect(res.body).toMatchObject({ online: true, ready: true, fullDiskAccess: null, automation: null });
  });

  it('advances lastSeenAt on every beat, which is what the re-check button waits for', async () => {
    await beat({}).expect(204);
    const first = (await request(app).get('/api/system/gateway')).body.lastSeenAt as string;
    await new Promise((r) => setTimeout(r, 15));
    await beat({}).expect(204);
    const second = (await request(app).get('/api/system/gateway')).body.lastSeenAt as string;
    expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());
  });

  it('goes offline once the last heartbeat is older than the threshold', async () => {
    await beat({}).expect(204);
    await db.gatewayHeartbeat.update({
      where: { id: 'gw-1' },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) },
    });
    const res = await request(app).get('/api/system/gateway').expect(200);
    expect(res.body.online).toBe(false);
    expect(res.body.ready).toBe(false);
  });
});
