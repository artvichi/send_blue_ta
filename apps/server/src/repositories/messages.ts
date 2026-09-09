import { randomUUID } from 'node:crypto';
import { Prisma, type MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import { canTransition, isTerminal } from '@sb/shared';
import type { SchedulingPolicy } from '../domain/policies/index.js';
import { claimedRowSchema, type ClaimedRow } from './settings.js';

/**
 * Column names are Prisma's defaults (camelCase), so raw SQL quotes them. The
 * enum is a native Postgres type, so comparisons are cast explicitly.
 */
const STATUS = (s: MessageStatus) => Prisma.sql`${s}::"MessageStatus"`;

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

/**
 * Atomically take the next eligible message out of the queue and lease it.
 *
 * This is the one place the codebase drops out of Prisma's query API, because
 * Prisma cannot express FOR UPDATE SKIP LOCKED and that clause is the whole
 * concurrency story:
 *
 *   - SELECT ... FOR UPDATE locks the candidate row.
 *   - SKIP LOCKED makes a concurrent claim step over a locked row rather than
 *     block on it, so N server instances each claim a *different* message
 *     instead of serializing behind one another.
 *
 * Together they make the claim safe under any number of concurrent tickers
 * without leader election, an advisory lock, or a coordination service.
 *
 * The returned row is parsed by Zod rather than cast, so a schema change that
 * breaks this query fails here rather than somewhere downstream.
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
 * Return leases that outlived their deadline to the queue.
 *
 * This is where delivery reliability actually lives. A gateway that crashes
 * between claiming and reporting, a network partition, a process killed
 * mid-dispatch -- all of them resolve here, in the database that owns the
 * truth, rather than depending on a transport-level acknowledgement.
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
 * Apply a status report from the gateway.
 *
 * Three independent guards, because reports arrive duplicated, out of order and
 * occasionally from an attempt that no longer exists:
 *
 *   1. The dispatch token must match the *current* attempt. A report from an
 *      attempt the reaper already reclaimed is discarded rather than applied to
 *      whichever attempt holds the message now.
 *   2. The transition must advance the progress rank, so a SENT that overtakes
 *      the DELIVERED behind it cannot walk the status backwards.
 *   3. The event log has a unique constraint on (messageId, status), so a
 *      redelivered report cannot duplicate a timeline entry.
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

    // The GUID is written once and never overwritten: it is the double-send
    // guard, and a later report must not be able to clear or replace it.
    if (input.providerGuid && !message.providerGuid) data.providerGuid = input.providerGuid;

    if (input.status === 'FAILED') data.lastError = input.error ?? 'Unknown gateway error';

    // A message that reached a terminal state is no longer leased.
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

/**
 * Append to the audit log, ignoring a collision.
 *
 * The unique constraint on (messageId, status) is what makes replay harmless:
 * a duplicated report collides and is dropped instead of adding a second
 * identical entry to the timeline.
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

// ---------------------------------------------------------------------------
// Queue reads and mutations
// ---------------------------------------------------------------------------

export async function createMessage(toE164: string, body: string, db: Db = prisma) {
  const message = await db.message.create({ data: { toE164, body } });
  await recordEvent(message.id, 'QUEUED', message.createdAt, null, db);
  return message;
}

/** Ordered queue contents, used to derive positions and projected send times. */
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
 * Requeue a failed message.
 *
 * Modelled as its own operation rather than as a status transition, because
 * returning to QUEUED is not something a gateway report should ever be able to
 * cause. The previous attempt's token and GUID are cleared so the new attempt
 * starts clean -- and so the double-send guard does not immediately veto it.
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

/** Whether an operator override is waiting, which bypasses the rate gate once. */
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
