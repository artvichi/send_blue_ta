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

/**
 * The gateway reports what it can actually do, not just that it is alive.
 * macOS permissions cannot be granted programmatically, so the UI needs to know
 * which are missing in order to point a human at the right settings pane.
 */
export const gatewayCapabilitiesSchema = z.object({
  fullDiskAccess: z.boolean(),
  automation: z.boolean(),
  /** The app the permissions belong to -- never `node`. */
  hostApp: z.string().nullable(),
});

export type GatewayCapabilities = z.infer<typeof gatewayCapabilitiesSchema>;

export const heartbeatSchema = z.object({
  gatewayId: z.string().min(1),
  driver: z.string().min(1),
  version: z.string().min(1),
  capabilities: gatewayCapabilitiesSchema.optional(),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
