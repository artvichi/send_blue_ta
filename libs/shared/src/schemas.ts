import { z } from 'zod';
import { MESSAGE_STATUSES } from './status.js';
import { parsePhone } from './phone.js';

/** A sanity bound, not a protocol limit. */
export const MAX_BODY_LENGTH = 2000;

export const messageStatusSchema = z.enum(MESSAGE_STATUSES);

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/** Fed to zodResolver in the browser and to validation on the server, so the two cannot drift. */
export const createMessageSchema = z.object({
  to: z
    .string()
    .min(1, 'Enter a phone number')
    .refine((v) => parsePhone(v).ok, 'That phone number is not valid'),
  body: z
    .string()
    .trim()
    .min(1, 'Enter a message')
    .max(MAX_BODY_LENGTH, `Keep it under ${MAX_BODY_LENGTH} characters`),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const listMessagesQuerySchema = z.object({
  status: messageStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

// ---------------------------------------------------------------------------
// Representations returned to clients
// ---------------------------------------------------------------------------

export const messageEventSchema = z.object({
  id: z.string(),
  status: messageStatusSchema,
  detail: z.unknown().nullable(),
  occurredAt: z.string(),
});

export const messageSchema = z.object({
  id: z.string(),
  queueSeq: z.string(),
  to: z.string(),
  body: z.string(),
  status: messageStatusSchema,
  attempts: z.number(),
  lastError: z.string().nullable(),
  providerGuid: z.string().nullable(),
  createdAt: z.string(),
  dispatchedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  /** 0-indexed position in the queue; null once the message has left it. */
  position: z.number().nullable(),
  /** Projected send time; null once the message has left the queue. */
  etaAt: z.string().nullable(),
});

export type MessageDto = z.infer<typeof messageSchema>;
export type MessageEventDto = z.infer<typeof messageEventSchema>;

export const messageDetailSchema = messageSchema.extend({
  events: z.array(messageEventSchema),
});

export type MessageDetailDto = z.infer<typeof messageDetailSchema>;

export const messageListSchema = z.object({
  items: z.array(messageSchema),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const MIN_INTERVAL_SECONDS = 5;
export const MAX_INTERVAL_SECONDS = 24 * 60 * 60;

export const settingsSchema = z.object({
  sendIntervalSeconds: z.number(),
  policy: z.string(),
  paused: z.boolean(),
});

export type SettingsDto = z.infer<typeof settingsSchema>;

/** The floor keeps a fast demo possible without allowing an unthrottled send loop. */
export const updateSettingsSchema = z
  .object({
    sendIntervalSeconds: z.coerce
      .number()
      .int()
      .min(MIN_INTERVAL_SECONDS)
      .max(MAX_INTERVAL_SECONDS)
      .optional(),
    paused: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// ---------------------------------------------------------------------------
// Stats and health
// ---------------------------------------------------------------------------

export const statsSchema = z.object({
  queued: z.number(),
  inFlight: z.number(),
  delivered: z.number(),
  failed: z.number(),
  canceled: z.number(),
  total: z.number(),
  lastDispatchedAt: z.string().nullable(),
  nextDueAt: z.string().nullable(),
});

export type StatsDto = z.infer<typeof statsSchema>;

export const gatewayHealthSchema = z.object({
  online: z.boolean(),
  gatewayId: z.string().nullable(),
  driver: z.string().nullable(),
  version: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
});

export type GatewayHealthDto = z.infer<typeof gatewayHealthSchema>;

// ---------------------------------------------------------------------------
// Gateway protocol
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
