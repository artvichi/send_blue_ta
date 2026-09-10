import type { Prisma, MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import { canTransition, isTerminal } from '@sb/shared';
import type { ApplyStatusInput, ApplyStatusResult } from './types.js';
import { getSettings } from './settings.js';

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
      select: {
        id: true,
        status: true,
        dispatchToken: true,
        providerGuid: true,
        attempts: true,
      },
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

    if (input.status === 'FAILED') {
      data.lastError = input.error ?? 'Unknown gateway error';

      /**
       * A failure inside the retry budget goes back in the queue rather than
       * stopping. No backoff of its own is needed: the rate limiter already
       * spaces attempts by the send interval, so retries inherit it.
       *
       * The GUID is cleared with it -- the previous attempt produced no
       * deliverable message, and leaving it set would make the double-send
       * guard veto the retry.
       */
      const { maxAttempts } = await getSettings(tx as unknown as Db);
      if (message.attempts < maxAttempts) {
        await tx.message.update({
          where: { id: input.messageId },
          data: {
            status: 'QUEUED',
            dispatchToken: null,
            leaseExpiresAt: null,
            providerGuid: null,
            lastError: data.lastError,
          },
        });
        // Deliberately no FAILED event: the message did not reach FAILED, it
        // went back in the queue. The attempt counter carries the retry story,
        // and lastError says why the previous try did not stick. Writing one
        // here would also collide with the unique (messageId, status) row that
        // a genuine, budget-exhausted failure needs later.
        return { outcome: 'applied', status: 'QUEUED' } as const;
      }
    }

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
