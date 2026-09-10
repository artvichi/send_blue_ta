import type { Prisma, MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import { canTransition, isTerminal } from '@sb/shared';
import type { ApplyStatusInput, ApplyStatusResult } from './types.js';

/**
 * Apply a gateway status report. Three guards, because reports arrive
 * duplicated, out of order, and sometimes from an attempt that no longer exists:
 * the dispatch token must match the current attempt; the transition must
 * advance the rank; and the event log's unique (messageId, status) makes a
 * replay collide instead of duplicating.
 */
export async function applyStatusReport(
  input: ApplyStatusInput,
  db: Db = prisma,
): Promise<ApplyStatusResult> {
  return db.$transaction(async (tx) => {
    const message = await tx.message.findUnique({
      where: { id: input.messageId },
      select: { id: true, status: true, dispatchToken: true, providerGuid: true },
    });

    if (!message) return { outcome: 'ignored', reason: 'not-found' } as const;

    if (message.dispatchToken !== input.dispatchToken) {
      return { outcome: 'ignored', reason: 'stale-token', status: message.status } as const;
    }

    /**
     * The GUID is a fact about the attempt, not a status, so it is persisted
     * even when the transition itself is rejected. Without this a gateway that
     * re-reports a status it already sent would silently fail to record the
     * double-send guard.
     */
    if (input.providerGuid && !message.providerGuid) {
      await tx.message.update({
        where: { id: input.messageId },
        data: { providerGuid: input.providerGuid },
      });
      message.providerGuid = input.providerGuid;
    }

    if (!canTransition(message.status, input.status)) {
      return { outcome: 'ignored', reason: 'no-transition', status: message.status } as const;
    }

    const data: Prisma.MessageUpdateInput = { status: input.status };

    const stampField = TIMESTAMP_FIELD[input.status];
    if (stampField) data[stampField] = input.occurredAt;

    // Written once, never overwritten: this is the double-send guard.
    if (input.providerGuid && !message.providerGuid) data.providerGuid = input.providerGuid;

    if (input.status === 'FAILED') data.lastError = input.error ?? 'Unknown gateway error';

    if (isTerminal(input.status)) {
      data.leaseExpiresAt = null;
    }

    await tx.message.update({ where: { id: input.messageId }, data });
    await recordEvent(
      input.messageId,
      input.status,
      input.occurredAt,
      input.error ? { error: input.error } : null,
      tx as unknown as Db,
    );

    return { outcome: 'applied', status: input.status } as const;
  });
}

/** Append to the audit log; a duplicate report collides and is dropped. */
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

// ---------------------------------------------------------------------------
// Queue reads and mutations
// ---------------------------------------------------------------------------

const TIMESTAMP_FIELD: Partial<Record<MessageStatus, 'sentAt' | 'deliveredAt' | 'receivedAt'>> = {
  SENT: 'sentAt',
  DELIVERED: 'deliveredAt',
  RECEIVED: 'receivedAt',
};
