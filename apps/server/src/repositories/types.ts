import { z } from 'zod';
import type { MessageStatus } from '../db/generated/client.js';

/**
 * Shape returned by the raw claim query. Parsed rather than cast, so a schema
 * change that breaks the query fails at the boundary instead of downstream.
 */
export const claimedRowSchema = z.object({
  id: z.string(),
  toE164: z.string(),
  body: z.string(),
  dispatchToken: z.string(),
  leaseExpiresAt: z.date(),
  providerGuid: z.string().nullable(),
});

export type ClaimedRow = z.infer<typeof claimedRowSchema>;

export interface Settings {
  sendIntervalSeconds: number;
  policy: string;
  paused: boolean;
}

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
