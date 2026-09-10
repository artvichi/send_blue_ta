import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { db, resetDatabase, seedMessages } from './helpers.js';
import { createApp } from '../src/http/app.js';

/**
 * The HTTP layer: validation, auth, and the mapping from domain outcomes to
 * status codes. The repository suites prove the queue mechanics; these prove
 * that a caller actually experiences them correctly.
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

describe('POST /api/messages', () => {
  it('normalizes to E.164 whatever shape the number arrives in', async () => {
    for (const input of ['206 345 6789', '(206) 345-6789', '+1 206 345 6789']) {
      await resetDatabase();
      const res = await request(app).post('/api/messages').send({ to: input, body: 'hi' });
      expect(res.status).toBe(201);
      expect(res.body.to).toBe('+12063456789');
    }
  });

  it('accepts the 555 numbers printed in the assessment mockup', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ to: '+1 (555) 123-4567', body: 'from the mockup' });
    expect(res.status).toBe(201);
  });

  it('rejects an unusable number with a field-level message', async () => {
    const res = await request(app).post('/api/messages').send({ to: 'nope', body: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.details[0].field).toBe('to');
  });

  it('rejects an empty body', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ to: '+12063456789', body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('body');
  });

  it('returns the message with its queue position and projected send time', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ to: '+12063456789', body: 'first' });
    expect(res.body.position).toBe(0);
    expect(res.body.etaAt).toBeTruthy();
    expect(res.body.status).toBe('QUEUED');
  });
});

describe('message lifecycle endpoints', () => {
  it('404s an unknown id rather than throwing', async () => {
    const res = await request(app).get('/api/messages/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('cancels a queued message', async () => {
    const [m] = await seedMessages(1);
    const res = await request(app).delete(`/api/messages/${m!.id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELED');
  });

  it('409s when cancelling something already cancelled', async () => {
    const [m] = await seedMessages(1);
    await request(app).delete(`/api/messages/${m!.id}`);
    const res = await request(app).delete(`/api/messages/${m!.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('409s when retrying a message that did not fail', async () => {
    const [m] = await seedMessages(1);
    const res = await request(app).post(`/api/messages/${m!.id}/retry`);
    expect(res.status).toBe(409);
  });

  it('accepts a send-now override on a queued message', async () => {
    const [m] = await seedMessages(1);
    const res = await request(app).post(`/api/messages/${m!.id}/send-now`);
    expect(res.status).toBe(200);
  });
});

describe('settings', () => {
  it('rejects an interval below the floor, so the queue cannot become a send loop', async () => {
    const res = await request(app).patch('/api/settings').send({ sendIntervalSeconds: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects an empty patch', async () => {
    const res = await request(app).patch('/api/settings').send({});
    expect(res.status).toBe(400);
  });

  it('applies a valid interval', async () => {
    const res = await request(app).patch('/api/settings').send({ sendIntervalSeconds: 30 });
    expect(res.status).toBe(200);
    expect(res.body.sendIntervalSeconds).toBe(30);
  });
});

describe('gateway protocol auth', () => {
  it('rejects an unauthenticated lease request', async () => {
    const res = await request(app).get('/api/gateway/lease?wait=0');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await request(app)
      .get('/api/gateway/lease?wait=0')
      .set('Authorization', 'Bearer not-the-token');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed authorization header', async () => {
    const res = await request(app).get('/api/gateway/lease?wait=0').set('Authorization', TOKEN);
    expect(res.status).toBe(401);
  });

  it('answers 204 when the queue is empty', async () => {
    const res = await request(app)
      .get('/api/gateway/lease?wait=0')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(204);
  });

  it('leases a due message, and does not hand out a second one', async () => {
    await seedMessages(2);
    const first = await request(app)
      .get('/api/gateway/lease?wait=0')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(first.status).toBe(200);
    expect(first.body.dispatchToken).toBeTruthy();

    // The rate gate closes the moment the first one is dispatched.
    const second = await request(app)
      .get('/api/gateway/lease?wait=0')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(second.status).toBe(204);
  });

  it('ignores a status report carrying a stale dispatch token', async () => {
    await seedMessages(1);
    const lease = await request(app)
      .get('/api/gateway/lease?wait=0')
      .set('Authorization', `Bearer ${TOKEN}`);

    const res = await request(app)
      .post(`/api/gateway/messages/${lease.body.messageId}/status`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ dispatchToken: 'stale', status: 'SENT', occurredAt: new Date().toISOString() });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ outcome: 'ignored', reason: 'stale-token' });
  });
});

describe('the dashboard never needs the gateway token', () => {
  it('serves gateway health unauthenticated', async () => {
    const res = await request(app).get('/api/system/gateway');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('online');
  });

  it('serves stats unauthenticated', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
  });
});

describe('health checks', () => {
  it('reports liveness', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
  });

  it('reports readiness only when the database answers', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('404s an unknown route in the standard error shape', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
