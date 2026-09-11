import type { MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import { canTransition } from '@sb/shared';
import { recordEvent } from './message-events.js';

export async function createMessage(toHandle: string, body: string, db: Db = prisma) {
  const message = await db.message.create({ data: { toHandle, body } });
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

/** Statuses a message can no longer leave, and so is safe to delete. */
const CLEARABLE: MessageStatus[] = ['DELIVERED', 'RECEIVED', 'FAILED', 'CANCELED'];

/**
 * Delete finished messages.
 *
 * Deliberately never touches QUEUED or in-flight work: those are sends that
 * have not happened yet, and dropping them would silently cancel something the
 * user scheduled. Cancelling is a separate, explicit action.
 *
 * Events go with them via the cascade on the relation.
 */
export async function clearHistory(db: Db = prisma): Promise<{ deleted: number; kept: number }> {
  const [deleted, kept] = await db.$transaction([
    db.message.deleteMany({ where: { status: { in: CLEARABLE } } }),
    db.message.count({ where: { status: { notIn: CLEARABLE } } }),
  ]);
  return { deleted: deleted.count, kept };
}

/** How many rows `clearHistory` would remove, for the confirmation copy. */
export async function countClearable(db: Db = prisma): Promise<number> {
  return db.message.count({ where: { status: { in: CLEARABLE } } });
}
