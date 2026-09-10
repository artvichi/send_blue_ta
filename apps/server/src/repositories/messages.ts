import type { MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import { canTransition } from '@sb/shared';
import { recordEvent } from './message-status.js';

export async function createMessage(toE164: string, body: string, db: Db = prisma) {
  const message = await db.message.create({ data: { toE164, body } });
  await recordEvent(message.id, 'QUEUED', message.createdAt, null, db);
  return message;
}

export async function cancelMessage(id: string, db: Db = prisma) {
  return db.$transaction(async (tx) => {
    const message = await tx.message.findUnique({ where: { id }, select: { status: true } });
    if (!message) return { ok: false, reason: 'not-found' } as const;

    // Only a queued message can be cancelled -- past that point the gateway may
    // already have sent it, and an iMessage cannot be recalled.
    if (!canTransition(message.status, 'CANCELED')) {
      return { ok: false, reason: 'not-cancelable', status: message.status } as const;
    }

    const now = new Date();
    await tx.message.update({ where: { id }, data: { status: 'CANCELED' } });
    await recordEvent(id, 'CANCELED', now, null, tx as unknown as Db);
    return { ok: true } as const;
  });
}

/**
 * Requeue a failed message. Its own operation rather than a transition, so no
 * gateway report can return a message to QUEUED. The previous token and GUID are
 * cleared so the double-send guard does not immediately veto the new attempt.
 */
export async function retryMessage(id: string, db: Db = prisma) {
  return db.$transaction(async (tx) => {
    const message = await tx.message.findUnique({ where: { id }, select: { status: true } });
    if (!message) return { ok: false, reason: 'not-found' } as const;
    if (message.status !== 'FAILED') {
      return { ok: false, reason: 'not-failed', status: message.status } as const;
    }

    await tx.message.update({
      where: { id },
      data: {
        status: 'QUEUED',
        dispatchToken: null,
        leaseExpiresAt: null,
        providerGuid: null,
        lastError: null,
        dispatchedAt: null,
      },
    });
    await tx.messageEvent.deleteMany({ where: { messageId: id, status: { in: ['FAILED'] } } });
    await recordEvent(id, 'QUEUED', new Date(), { retriedAt: new Date().toISOString() }, tx as unknown as Db);
    return { ok: true } as const;
  });
}

export async function findMessage(id: string, db: Db = prisma) {
  return db.message.findUnique({
    where: { id },
    include: { events: { orderBy: { occurredAt: 'asc' } } },
  });
}

export async function countsByStatus(db: Db = prisma): Promise<Record<MessageStatus, number>> {
  const rows = await db.message.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = {
    QUEUED: 0,
    DISPATCHING: 0,
    ACCEPTED: 0,
    SENT: 0,
    DELIVERED: 0,
    RECEIVED: 0,
    FAILED: 0,
    CANCELED: 0,
  } as Record<MessageStatus, number>;
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}
