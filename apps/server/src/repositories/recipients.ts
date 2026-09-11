import { Prisma } from '../db/generated/client.js';
import { prisma, type Db } from '../db/prisma.js';

export interface RecipientPatch {
  name?: string;
  handle?: string;
}

/**
 * Search by name or handle. A recipient's handle is normalized, so a search
 * for "206" or "icloud" matches by substring the way a person expects, and a
 * search for the exact normalized string is how the compose form recognises a
 * known recipient.
 */
export async function searchRecipients(q: string | undefined, limit: number, db: Db = prisma) {
  const needle = q?.trim();
  return db.recipient.findMany({
    where: needle
      ? {
          OR: [
            { name: { contains: needle, mode: 'insensitive' } },
            { handle: { contains: needle.toLowerCase() } },
          ],
        }
      : {},
    orderBy: [{ name: 'asc' }],
    take: limit,
  });
}

export async function findRecipient(id: string, db: Db = prisma) {
  return db.recipient.findUnique({ where: { id } });
}

/**
 * Create, or report the collision. `handle` is unique, so the database is the
 * arbiter of "already in the book" -- no read-then-write race.
 */
export async function createRecipient(name: string, handle: string, db: Db = prisma) {
  try {
    const recipient = await db.recipient.create({ data: { name, handle } });
    return { ok: true, recipient } as const;
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate-handle' } as const;
    throw err;
  }
}

export async function updateRecipient(id: string, patch: RecipientPatch, db: Db = prisma) {
  try {
    const recipient = await db.recipient.update({ where: { id }, data: patch });
    return { ok: true, recipient } as const;
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate-handle' } as const;
    if (isNotFound(err)) return { ok: false, reason: 'not-found' } as const;
    throw err;
  }
}

export async function deleteRecipient(id: string, db: Db = prisma): Promise<boolean> {
  try {
    await db.recipient.delete({ where: { id } });
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** Names for a set of handles, for decorating message rows. */
export async function namesByHandle(
  handles: string[],
  db: Db = prisma,
): Promise<Map<string, string>> {
  const unique = [...new Set(handles)];
  if (unique.length === 0) return new Map();
  const rows = await db.recipient.findMany({
    where: { handle: { in: unique } },
    select: { handle: true, name: true },
  });
  return new Map(rows.map((r) => [r.handle, r.name]));
}

/** How many messages each handle has been sent, for the address book list. */
export async function messageCountsByHandle(
  handles: string[],
  db: Db = prisma,
): Promise<Map<string, number>> {
  if (handles.length === 0) return new Map();
  const rows = await db.message.groupBy({
    by: ['toHandle'],
    where: { toHandle: { in: handles } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.toHandle, r._count._all]));
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
const isNotFound = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
