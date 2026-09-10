import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { dateToAppleNs, sqlLiteral } from './apple-time.js';

const execFileAsync = promisify(execFile);

export { appleTimeToDate, dateToAppleNs, sqlLiteral } from './apple-time.js';

export const CHAT_DB_PATH = join(homedir(), 'Library', 'Messages', 'chat.db');

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
 * Read through a snapshot. Messages.app holds the database open in WAL mode, so
 * reading the main file alone can miss writes still in -wal; all three files are
 * copied and the copy opened read-only.
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
    // Absent siblings are fine -- Messages may have checkpointed.
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


/**
 * AppleScript reports nothing about what it sent, so the row is located by
 * correlation: outgoing, to this handle, no earlier than just before the send.
 * On recent macOS `text` is often NULL (the body lives in `attributedBody`), so
 * text narrows the match rather than gating it.
 */
export async function findSentMessage(
  toHandle: string,
  body: string,
  sentAfter: Date,
): Promise<ChatDbRow | null> {
  const since = Math.floor(dateToAppleNs(sentAfter));

  const sql = `
    SELECT m.guid, m.text, h.id AS handle, m.is_from_me, m.is_sent,
           m.is_delivered, m.is_read, m.date, m.date_delivered, m.date_read, m.error
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.is_from_me = 1
      AND m.date >= ${since}
      AND ${handleMatchSql(toHandle)}
    ORDER BY m.date DESC
    LIMIT 10;
  `;

  const rows = await queryChatDb(sql);
  if (rows.length === 0) return null;

  const exact = rows.find((r) => r.text !== null && r.text === body);
  return exact ?? rows[0] ?? null;
}

/**
 * Match a handle as chat.db stores it.
 *
 * Email handles compare exactly (case-insensitively); phone numbers cannot,
 * because Messages records them in whatever shape the send used -- +1 206...,
 * (206) ..., 206-... -- so those are compared on their last ten digits after
 * stripping punctuation.
 */
function handleMatchSql(toHandle: string): string {
  if (toHandle.includes('@')) {
    return `LOWER(COALESCE(h.id,'')) = ${sqlLiteral(toHandle.toLowerCase())}`;
  }

  const tail = toHandle.replace(/[^0-9]/g, '').slice(-10);
  return `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(h.id,''), '+', ''), '-', ''), ' ', ''), '()', '')
          LIKE ${sqlLiteral('%' + tail)}`;
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
