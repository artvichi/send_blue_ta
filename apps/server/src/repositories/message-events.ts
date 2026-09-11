import type { Prisma, MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';

/**
 * The append-only audit log behind the per-message timeline.
 *
 * `(messageId, status)` is unique, so a redelivered report collides and is
 * dropped rather than duplicating a row. That constraint is what makes replay
 * harmless for the timeline; the rank check in `applyStatusReport` is what
 * makes it harmless for the message itself.
 */
export async function recordEvent(
  messageId: string,
  status: MessageStatus,
  occurredAt: Date,
  detail: Prisma.InputJsonValue | null,
  db: Db = prisma,
): Promise<void> {
  await db.messageEvent.createMany({
    data: [{ messageId, status, occurredAt, ...(detail ? { detail } : {}) }],
    skipDuplicates: true,
  });
}

export async function listEvents(messageId: string, db: Db = prisma) {
  return db.messageEvent.findMany({ where: { messageId }, orderBy: { occurredAt: 'asc' } });
}
