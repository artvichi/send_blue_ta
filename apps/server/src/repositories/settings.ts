import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import type { Db } from '../db/prisma.js';
import { env } from '../config/env.js';

const SETTINGS_ID = 1;

export interface Settings {
  sendIntervalSeconds: number;
  policy: string;
  paused: boolean;
}

/**
 * The settings row is created on first read rather than by a migration, so a
 * fresh database is usable without a seed step. The env var supplies the
 * initial interval only; from then on the database is authoritative, which is
 * what makes a runtime change survive a restart.
 */
export async function getSettings(db: Db = prisma): Promise<Settings> {
  const row = await db.setting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: {
      id: SETTINGS_ID,
      sendIntervalSeconds: env().DEFAULT_SEND_INTERVAL_SECONDS,
    },
  });
  return {
    sendIntervalSeconds: row.sendIntervalSeconds,
    policy: row.policy,
    paused: row.paused,
  };
}

export async function updateSettings(
  patch: Partial<Pick<Settings, 'sendIntervalSeconds' | 'paused'>>,
  db: Db = prisma,
): Promise<Settings> {
  await getSettings(db);
  const row = await db.setting.update({ where: { id: SETTINGS_ID }, data: patch });
  return {
    sendIntervalSeconds: row.sendIntervalSeconds,
    policy: row.policy,
    paused: row.paused,
  };
}

/** Shape returned by the raw claim query. Validated rather than cast. */
export const claimedRowSchema = z.object({
  id: z.string(),
  toE164: z.string(),
  body: z.string(),
  dispatchToken: z.string(),
  leaseExpiresAt: z.date(),
  providerGuid: z.string().nullable(),
});

export type ClaimedRow = z.infer<typeof claimedRowSchema>;
