import { randomUUID } from 'node:crypto';
import { Prisma, type MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import { canTransition, isTerminal } from '@sb/shared';
import type { SchedulingPolicy } from '../domain/policies/index.js';
import { claimedRowSchema, type ClaimedRow } from './settings.js';

/** Columns are Prisma's camelCase defaults; the enum is a native Postgres type. */
const STATUS = (s: MessageStatus) => Prisma.sql`${s}::"MessageStatus"`;

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

/**
 * Atomically take the next eligible message and lease it.
 *
 * The one place we leave Prisma's query API, because it cannot express
 * FOR UPDATE SKIP LOCKED -- and that clause is the whole concurrency story:
 * SKIP LOCKED makes a concurrent claimer step over a locked row instead of
 * blocking, so N instances each claim a *different* message with no leader
 * election. The result is Zod-parsed, not cast, so a schema change fails here
 * rather than downstream.
 */
export async function claimNextMessage(
  policy: SchedulingPolicy,
  now: Date,
  leaseSeconds: number,
  db: Db = prisma,
): Promise<ClaimedRow | null> {
  const dispatchToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);

  const rows = await db.$queryRaw<unknown[]>(Prisma.sql`
    UPDATE "messages" SET
      status           = ${STATUS('DISPATCHING')},
      "dispatchToken"  = ${dispatchToken},
      "leaseExpiresAt" = ${leaseExpiresAt},
      "dispatchedAt"   = ${now},
      "updatedAt"      = ${now},
      "forceDispatch"  = FALSE,
      attempts         = attempts + 1
    WHERE id = (
      SELECT id FROM "messages"
      WHERE status = ${STATUS('QUEUED')}
        AND ${policy.eligibility(now)}
      ORDER BY ${policy.ordering()}
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "toE164", body, "dispatchToken", "leaseExpiresAt", "providerGuid";
  `);

  const row = rows[0];
  if (!row) return null;

  const claimed = claimedRowSchema.parse(row);
  await recordEvent(claimed.id, 'DISPATCHING', now, { dispatchToken }, db);
  return claimed;
}

/**
 * Return expired leases to the queue. This -- not the transport -- is where
 * delivery reliability lives: gateway crash, partition, death mid-dispatch.
 */
export async function reapExpiredLeases(now: Date, db: Db = prisma): Promise<number> {
  const expired = await db.message.findMany({
    where: { status: 'DISPATCHING', leaseExpiresAt: { lt: now } },
    select: { id: true },
  });
  if (expired.length === 0) return 0;

  const ids = expired.map((m) => m.id);
  await db.message.updateMany({
    where: { id: { in: ids } },
    data: { status: 'QUEUED', dispatchToken: null, leaseExpiresAt: null },
  });
  return ids.length;
}

// ---------------------------------------------------------------------------
// Status reporting
// ---------------------------------------------------------------------------

const TIMESTAMP_FIELD: Partial<Record<MessageStatus, 'sentAt' | 'deliveredAt' | 'receivedAt'>> = {
  SENT: 'sentAt',
  DELIVERED: 'deliveredAt',
  RECEIVED: 'receivedAt',
};

export interface ApplyStatusInput {
  messageId: string;
  dispatchToken: string;
  status: MessageStatus;
  occurredAt: Date;
  providerGuid?: string | undefined;
  error?: string | undefined;
}

export type ApplyStatusResult =
  | { outcome: 'applied'; status: MessageStatus }
  | { outcome: 'ignored'; reason: 'stale-token' | 'not-found' | 'no-transition'; status?: MessageStatus };

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

export async function createMessage(toE164: string, body: string, db: Db = prisma) {
  const message = await db.message.create({ data: { toE164, body } });
  await recordEvent(message.id, 'QUEUED', message.createdAt, null, db);
  return message;
}

/** Ordered queue contents, for deriving positions and ETAs. */
export async function listQueued(policy: SchedulingPolicy, db: Db = prisma) {
  return db.message.findMany({
    where: { status: 'QUEUED' },
    orderBy: policyOrderBy(policy),
    select: { id: true },
  });
}

function policyOrderBy(policy: SchedulingPolicy): Prisma.MessageOrderByWithRelationInput[] {
  if (policy.name === 'TIMESTAMPED') {
    return [{ scheduledAt: 'asc' }, { priority: 'desc' }, { queueSeq: 'asc' }];
  }
  return [{ queueSeq: 'asc' }];
}

export async function lastDispatchedAt(db: Db = prisma): Promise<Date | null> {
  const row = await db.message.aggregate({ _max: { dispatchedAt: true } });
  return row._max.dispatchedAt ?? null;
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

/** Whether an operator override is waiting; it bypasses the rate gate once. */
export async function hasForcedMessage(db: Db = prisma): Promise<boolean> {
  const count = await db.message.count({ where: { status: 'QUEUED', forceDispatch: true } });
  return count > 0;
}

/** Mark a queued message for immediate dispatch on the next lease request. */
export async function forceDispatch(id: string, db: Db = prisma) {
  return db.$transaction(async (tx) => {
    const message = await tx.message.findUnique({ where: { id }, select: { status: true } });
    if (!message) return { ok: false, reason: 'not-found' } as const;
    if (message.status !== 'QUEUED') {
      return { ok: false, reason: 'not-queued', status: message.status } as const;
    }
    await tx.message.update({ where: { id }, data: { forceDispatch: true } });
    return { ok: true } as const;
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
