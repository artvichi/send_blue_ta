import { randomUUID } from 'node:crypto';
import { Prisma, type MessageStatus } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';
import type { SchedulingPolicy } from '../domain/policies/index.js';
import { claimedRowSchema, type ClaimedRow } from './types.js';
import { recordEvent } from './message-status.js';

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
    RETURNING id, "toHandle", body, "dispatchToken", "leaseExpiresAt", "providerGuid";
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

export interface ActivityBucket {
  hour: Date;
  delivered: number;
  failed: number;
  inFlight: number;
}

/**
 * What the queue pushed out, bucketed by hour.
 *
 * Bucketed on `dispatchedAt` rather than `createdAt`: the question this answers
 * is "what did the system send, and how did it go", not "when did people type".
 * Hours with no activity are filled in by generate_series so the chart keeps a
 * continuous time axis instead of collapsing gaps.
 */
export async function activityByHour(hours: number, db: Db = prisma): Promise<ActivityBucket[]> {
  const rows = await db.$queryRaw<
    { hour: Date; delivered: bigint; failed: bigint; in_flight: bigint }[]
  >(Prisma.sql`
    WITH slots AS (
      SELECT generate_series(
        date_trunc('hour', now()) - make_interval(hours => ${hours - 1}),
        date_trunc('hour', now()),
        interval '1 hour'
      ) AS hour
    )
    SELECT
      s.hour,
      COUNT(m.id) FILTER (WHERE m.status IN ('DELIVERED', 'RECEIVED')) AS delivered,
      COUNT(m.id) FILTER (WHERE m.status = 'FAILED')                   AS failed,
      COUNT(m.id) FILTER (WHERE m.status IN ('DISPATCHING','ACCEPTED','SENT')) AS in_flight
    FROM slots s
    LEFT JOIN "messages" m
      ON m."dispatchedAt" >= s.hour
     AND m."dispatchedAt" <  s.hour + interval '1 hour'
    GROUP BY s.hour
    ORDER BY s.hour ASC;
  `);

  return rows.map((r) => ({
    hour: r.hour,
    delivered: Number(r.delivered),
    failed: Number(r.failed),
    inFlight: Number(r.in_flight),
  }));
}
