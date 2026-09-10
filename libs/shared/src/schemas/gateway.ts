import { z } from 'zod';
import { messageStatusSchema } from './common.js';

/**
 * `providerGuid` is the double-send guard travelling with the work: non-null
 * means a previous attempt already sent this and only the report was lost, so
 * the gateway re-attaches instead of texting someone twice.
 */
export const leaseSchema = z.object({
  messageId: z.string(),
  dispatchToken: z.string(),
  to: z.string(),
  body: z.string(),
  leaseExpiresAt: z.string(),
  // Absent, not just null: gateway and server deploy independently.
  providerGuid: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

export type LeaseDto = z.infer<typeof leaseSchema>;

/**
 * `dispatchToken` scopes the report to one attempt, so a late report cannot
 * corrupt a newer one. `occurredAt` is when the gateway observed the change.
 */
export const reportStatusSchema = z.object({
  dispatchToken: z.string().min(1),
  status: messageStatusSchema,
  providerGuid: z.string().optional(),
  occurredAt: z.coerce.date(),
  error: z.string().optional(),
});

export type ReportStatusInput = z.infer<typeof reportStatusSchema>;

export const heartbeatSchema = z.object({
  gatewayId: z.string().min(1),
  driver: z.string().min(1),
  version: z.string().min(1),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
