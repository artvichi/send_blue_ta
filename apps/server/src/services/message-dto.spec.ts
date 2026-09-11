import { describe, it, expect } from 'vitest';
import type { Message } from '../db/generated/client.js';
import { toDto, type QueueProjection } from './message-dto.js';

const row = (overrides: Partial<Message> = {}): Message => ({
  id: 'm-1',
  queueSeq: 42n,
  toHandle: '+12063456789',
  body: 'hello',
  status: 'QUEUED',
  forceDispatch: false,
  scheduledAt: null,
  priority: 0,
  dispatchToken: null,
  leaseExpiresAt: null,
  attempts: 0,
  providerGuid: null,
  lastError: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  dispatchedAt: null,
  sentAt: null,
  deliveredAt: null,
  receivedAt: null,
  ...overrides,
});

describe('toDto', () => {
  it('serialises BigInt and dates into JSON-safe strings', () => {
    const dto = toDto(row(), new Map());
    expect(dto.queueSeq).toBe('42');
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.to).toBe('+12063456789');
  });

  it('attaches position and ETA for a message in the queue projection', () => {
    const etaAt = new Date('2026-01-01T01:00:00Z');
    const projection: QueueProjection = new Map([['m-1', { position: 2, etaAt }]]);
    const dto = toDto(row(), projection);
    expect(dto.position).toBe(2);
    expect(dto.etaAt).toBe(etaAt.toISOString());
  });

  it('reports null position and ETA once a message has left the queue', () => {
    const dto = toDto(row({ status: 'DELIVERED', deliveredAt: new Date('2026-01-01T02:00:00Z') }), new Map());
    expect(dto.position).toBeNull();
    expect(dto.etaAt).toBeNull();
    expect(dto.deliveredAt).toBe('2026-01-01T02:00:00.000Z');
  });

  it('never leaks the dispatch token or lease into the client shape', () => {
    const dto = toDto(row({ dispatchToken: 'secret', leaseExpiresAt: new Date() }), new Map());
    expect(dto).not.toHaveProperty('dispatchToken');
    expect(dto).not.toHaveProperty('leaseExpiresAt');
  });
});
