import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { db, resetDatabase } from './helpers.js';
import { createApp } from '../src/http/app.js';

/**
 * The address book. The property under test is that a recipient and a message
 * meet on one normalized string, with no foreign key to drift.
 */
let app: Express;

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
  app = createApp();
});
beforeEach(resetDatabase);
afterAll(async () => {
  await db.$disconnect();
});

const add = (name: string, to: string) => request(app).post('/api/recipients').send({ name, to });

describe('POST /api/recipients', () => {
  it('normalizes the handle exactly as a message would', async () => {
    const res = await add('Ada', '(206) 345-6789').expect(201);
    expect(res.body).toMatchObject({ name: 'Ada', handle: '+12063456789', kind: 'phone', messageCount: 0 });
  });

  it('lowercases an Apple ID email', async () => {
    const res = await add('Bob', 'Bob@ICloud.com').expect(201);
    expect(res.body).toMatchObject({ handle: 'bob@icloud.com', kind: 'email' });
  });

  it('rejects a duplicate handle, however it is typed', async () => {
    await add('Ada', '+1 206 345 6789').expect(201);
    const res = await add('Ada again', '206-345-6789').expect(409);
    expect(res.body.error.message).toMatch(/already/);
  });

  it('reports the specific recipient problem as a field error', async () => {
    const res = await add('Nobody', 'not@an').expect(400);
    expect(JSON.stringify(res.body)).toMatch(/email address is not valid/);
  });

  it('requires a name', async () => {
    await add('   ', '+12063456789').expect(400);
  });
});

describe('GET /api/recipients', () => {
  beforeEach(async () => {
    await add('Ada Lovelace', '+12063456789');
    await add('Bob', 'bob@icloud.com');
    await add('Charlie', '+14155550100');
  });

  it('lists alphabetically with message counts by handle', async () => {
    await db.message.createMany({
      data: [
        { toHandle: '+12063456789', body: 'a' },
        { toHandle: '+12063456789', body: 'b' },
      ],
    });
    const res = await request(app).get('/api/recipients').expect(200);
    expect(res.body.items.map((r: { name: string }) => r.name)).toEqual(['Ada Lovelace', 'Bob', 'Charlie']);
    expect(res.body.items[0].messageCount).toBe(2);
    expect(res.body.items[1].messageCount).toBe(0);
  });

  it('searches name and handle, case-insensitively', async () => {
    const byName = await request(app).get('/api/recipients?q=lovel').expect(200);
    expect(byName.body.items).toHaveLength(1);
    const byDigits = await request(app).get('/api/recipients?q=415').expect(200);
    expect(byDigits.body.items[0].name).toBe('Charlie');
    const byEmail = await request(app).get('/api/recipients?q=ICLOUD').expect(200);
    expect(byEmail.body.items[0].name).toBe('Bob');
  });
});

describe('PATCH and DELETE', () => {
  it('renames, and re-normalizes a changed handle', async () => {
    const { body: ada } = await add('Ada', '+12063456789');
    const res = await request(app)
      .patch(`/api/recipients/${ada.id}`)
      .send({ name: 'Ada L.', to: 'ada@example.com' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Ada L.', handle: 'ada@example.com', kind: 'email' });
  });

  it('refuses to change a handle onto another recipient', async () => {
    const { body: ada } = await add('Ada', '+12063456789');
    await add('Bob', 'bob@icloud.com');
    await request(app).patch(`/api/recipients/${ada.id}`).send({ to: 'BOB@icloud.com' }).expect(409);
  });

  it('rejects an empty patch', async () => {
    const { body: ada } = await add('Ada', '+12063456789');
    await request(app).patch(`/api/recipients/${ada.id}`).send({}).expect(400);
  });

  it('404s an unknown recipient', async () => {
    await request(app).patch('/api/recipients/nope').send({ name: 'x' }).expect(404);
    await request(app).delete('/api/recipients/nope').expect(404);
  });

  it('deleting forgets the name but keeps the message history', async () => {
    const { body: ada } = await add('Ada', '+12063456789');
    const { body: msg } = await request(app)
      .post('/api/messages')
      .send({ to: '206 345 6789', body: 'hi' })
      .expect(201);
    expect(msg.recipientName).toBe('Ada');

    await request(app).delete(`/api/recipients/${ada.id}`).expect(204);

    const after = await request(app).get(`/api/messages/${msg.id}`).expect(200);
    expect(after.body.recipientName).toBeNull();
    expect(after.body.to).toBe('+12063456789');
  });
});

describe('messages join to the address book by handle', () => {
  it('decorates list, queue and detail with the recipient name', async () => {
    await request(app).post('/api/messages').send({ to: '+1 206 345 6789', body: 'before' }).expect(201);
    // Added after the message: the join is by string, not by a key set at write time.
    await add('Ada', '206-345-6789').expect(201);

    const list = await request(app).get('/api/messages').expect(200);
    expect(list.body.items[0].recipientName).toBe('Ada');
    const queue = await request(app).get('/api/messages/queue').expect(200);
    expect(queue.body.items[0].recipientName).toBe('Ada');
  });

  it('leaves recipientName null for an unknown handle', async () => {
    const { body } = await request(app).post('/api/messages').send({ to: 'x@y.com', body: 'hi' }).expect(201);
    expect(body.recipientName).toBeNull();
  });
});
