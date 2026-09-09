import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);

export const CHAT_DB_PATH = join(homedir(), 'Library', 'Messages', 'chat.db');

/**
 * Apple stores these timestamps as nanoseconds since 2001-01-01 UTC, not as a
 * Unix epoch. 978307200 is the offset between the two.
 *
 * Very old rows use seconds rather than nanoseconds, so the magnitude decides
 * which unit is in play.
 */
const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200;

export function appleTimeToDate(value: number | null): Date | null {
  if (!value) return null;
  const seconds = value > 1e11 ? value / 1e9 : value;
  return new Date((seconds + APPLE_EPOCH_OFFSET_SECONDS) * 1000);
}

export function dateToAppleNs(date: Date): number {
  return (date.getTime() / 1000 - APPLE_EPOCH_OFFSET_SECONDS) * 1e9;
}

export interface ChatDbRow {
  guid: string;
  text: string | null;
  handle: string | null;
  is_from_me: number;
  is_sent: number;
  is_delivered: number;
  is_read: number;
  date: number | null;
  date_delivered: number | null;
  date_read: number | null;
  error: number;
}

export class ChatDbAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatDbAccessError';
  }
}

/**
 * Read chat.db through a snapshot rather than in place.
 *
 * Messages.app keeps the database in WAL mode and holds it open. Reading the
 * main file alone can miss recent writes that are still in the -wal segment, so
 * all three files are copied together and the copy is opened read-only. This
 * also guarantees we can never interfere with Messages.app itself.
 */
export async function queryChatDb(sql: string): Promise<ChatDbRow[]> {
  if (!existsSync(CHAT_DB_PATH)) {
    throw new ChatDbAccessError(
      `chat.db not found at ${CHAT_DB_PATH}. Is Messages set up on this Mac?`,
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'sbta-chatdb-'));
  const snapshot = join(dir, 'chat.db');

  try {
    await copyFile(CHAT_DB_PATH, snapshot);
    // The -wal and -shm siblings may legitimately be absent when Messages has
    // checkpointed, so their absence is not an error.
    for (const suffix of ['-wal', '-shm']) {
      const source = `${CHAT_DB_PATH}${suffix}`;
      if (existsSync(source)) await copyFile(source, `${snapshot}${suffix}`);
    }

    const { stdout } = await execFileAsync('sqlite3', ['-json', '-readonly', snapshot, sql], {
      maxBuffer: 16 * 1024 * 1024,
    });
    if (!stdout.trim()) return [];
    return JSON.parse(stdout) as ChatDbRow[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/operation not permitted|authorization denied|unable to open/i.test(message)) {
      throw new ChatDbAccessError(
        'Cannot read chat.db: macOS is blocking access.\n' +
          '  Grant Full Disk Access to the terminal running this gateway:\n' +
          '  System Settings > Privacy & Security > Full Disk Access, then restart the terminal.',
      );
    }
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Escape a value for inline use in a SQL literal. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Find the message we just sent.
 *
 * AppleScript reports nothing about what it sent, so the row has to be located
 * by correlation: an outgoing message, to this handle, created no earlier than
 * the moment just before the send. Text is compared when chat.db has it -- on
 * recent macOS `text` is often NULL because the body lives in `attributedBody`
 * as a binary plist -- so it narrows the match rather than gating it.
 */
export async function findSentMessage(
  toE164: string,
  body: string,
  sentAfter: Date,
): Promise<ChatDbRow | null> {
  const since = Math.floor(dateToAppleNs(sentAfter));
  const digits = toE164.replace(/[^0-9]/g, '');
  const tail = digits.slice(-10);

  const sql = `
    SELECT m.guid, m.text, h.id AS handle, m.is_from_me, m.is_sent,
           m.is_delivered, m.is_read, m.date, m.date_delivered, m.date_read, m.error
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.is_from_me = 1
      AND m.date >= ${since}
      AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(h.id,''), '+', ''), '-', ''), ' ', ''), '()', '')
          LIKE ${sqlLiteral('%' + tail)}
    ORDER BY m.date DESC
    LIMIT 10;
  `;

  const rows = await queryChatDb(sql);
  if (rows.length === 0) return null;

  const exact = rows.find((r) => r.text !== null && r.text === body);
  return exact ?? rows[0] ?? null;
}

/** Current delivery state of one message, by GUID. */
export async function getMessageState(guid: string): Promise<ChatDbRow | null> {
  const sql = `
    SELECT m.guid, m.text, h.id AS handle, m.is_from_me, m.is_sent,
           m.is_delivered, m.is_read, m.date, m.date_delivered, m.date_read, m.error
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.guid = ${sqlLiteral(guid)}
    LIMIT 1;
  `;
  const rows = await queryChatDb(sql);
  return rows[0] ?? null;
}
