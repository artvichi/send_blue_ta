import type { Prisma, MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import { canTransition, isTerminal } from '@sb/shared';
import type { ApplyStatusInput, ApplyStatusResult } from './types.js';
import { getSettings } from './settings.js';
import { recordEvent } from './message-events.js';

/** Thrown inside the transaction when the row changed under us; retried. */
class ConcurrentReport extends Error {}

const MAX_ATTEMPTS = 4;

/**
 * Apply a gateway status report. Three guards, because reports arrive
 * duplicated, out of order, and sometimes from an attempt that no longer exists:
 * the dispatch token must match the current attempt; the transition must
 * advance the rank; and the event log's unique (messageId, status) makes a
 * replay collide instead of duplicating.
 *
 * Reports for one message also arrive *concurrently* -- a single chat.db poll
 * can observe delivered and read at once and fire both. Every write is a
 * compare-and-set on the status this transaction read, so of two racing
 * reports one wins and the other re-reads and re-applies the guards against
 * the new state. Without this the later commit silently overwrote the earlier
 * one, and a message could end at DELIVERED with its read receipt recorded.
 */
export async function applyStatusReport(
  input: ApplyStatusInput,
  db: Db = prisma,
): Promise<ApplyStatusResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await applyOnce(input, db);
    } catch (err) {
      if (!(err instanceof ConcurrentReport) || attempt >= MAX_ATTEMPTS) throw err;
    }
  }
}

async function applyOnce(input: ApplyStatusInput, db: Db): Promise<ApplyStatusResult> {
  return db.$transaction(async (tx) => {
    const message = await tx.message.findUnique({
      where: { id: input.messageId },
      select: {
        id: true,
        status: true,
        dispatchToken: true,
        providerGuid: true,
        attempts: true,
        sentAt: true,
        deliveredAt: true,
        receivedAt: true,
      },
    });

    if (!message) return { outcome: 'ignored', reason: 'not-found' } as const;

    /** Write only if the row is still in the state this transaction read. */
    const cas = async (data: Prisma.MessageUpdateManyMutationInput) => {
      const { count } = await tx.message.updateMany({
        where: { id: input.messageId, status: message.status, dispatchToken: message.dispatchToken },
        data,
      });
      if (count === 0) throw new ConcurrentReport();
    };

    if (message.dispatchToken !== input.dispatchToken) {
      return { outcome: 'ignored', reason: 'stale-token', status: message.status } as const;
    }

    /**
     * The GUID is a fact about the attempt, not a status, so it is persisted
     * even when the transition itself is rejected. Without this a gateway that
     * re-reports a status it already sent would silently fail to record the
     * double-send guard.
     */
    const facts: Prisma.MessageUpdateManyMutationInput = {};
    if (input.providerGuid && !message.providerGuid) facts.providerGuid = input.providerGuid;

    // Likewise a timestamp: DELIVERED arriving after RECEIVED cannot move the
    // status backwards, but the message *was* delivered at that instant and
    // the timeline should say when.
    const stampField = TIMESTAMP_FIELD[input.status];
    if (stampField && !message[stampField]) facts[stampField] = input.occurredAt;

    if (!canTransition(message.status, input.status)) {
      if (Object.keys(facts).length > 0) await cas(facts);
      return { outcome: 'ignored', reason: 'no-transition', status: message.status } as const;
    }

    const data: Prisma.MessageUpdateManyMutationInput = { ...facts, status: input.status };

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
        await cas({
          status: 'QUEUED',
          dispatchToken: null,
          leaseExpiresAt: null,
          providerGuid: null,
          lastError: data.lastError,
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

    await cas(data);
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

const TIMESTAMP_FIELD: Partial<Record<MessageStatus, 'sentAt' | 'deliveredAt' | 'receivedAt'>> = {
  SENT: 'sentAt',
  DELIVERED: 'deliveredAt',
  RECEIVED: 'receivedAt',
};
