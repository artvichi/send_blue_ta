import { z } from 'zod';
import { MESSAGE_STATUSES } from './status.js';
import { parsePhone } from './phone.js';
/** iMessage has no hard body cap; this is a sanity bound, not a protocol limit. */
export const MAX_BODY_LENGTH = 2000;
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
/**
 * The single source of truth for the compose form. The web app feeds this to
 * `zodResolver` and the server feeds the same object to its validation
 * middleware, so the two can never drift.
 */
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
export const listMessagesQuerySchema = z.object({
    status: messageStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().optional(),
});
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
export const messageDetailSchema = messageSchema.extend({
    events: z.array(messageEventSchema),
});
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
/**
 * The interval floor exists so the demo can be driven at 10s without letting
 * anyone set it to zero and turn the queue into an unthrottled send loop.
 */
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
export const gatewayHealthSchema = z.object({
    online: z.boolean(),
    gatewayId: z.string().nullable(),
    driver: z.string().nullable(),
    version: z.string().nullable(),
    lastSeenAt: z.string().nullable(),
});
// ---------------------------------------------------------------------------
// Gateway protocol
// ---------------------------------------------------------------------------
/**
 * What the gateway receives when it wins a lease.
 *
 * `providerGuid` is the double-send guard travelling with the work. If a send
 * succeeded but its status report was lost, the reaper will eventually requeue
 * the message -- and re-leasing it would text a real person twice. A non-null
 * GUID here tells the gateway the send already happened, so it re-attaches to
 * the existing message instead of sending a second one.
 */
export const leaseSchema = z.object({
    messageId: z.string(),
    dispatchToken: z.string(),
    to: z.string(),
    body: z.string(),
    leaseExpiresAt: z.string(),
    // Tolerant of an absent field, not just a null one: the gateway runs on a Mac
    // and the server in the cloud, so the two are deployed independently and a
    // version skew must not break the loop.
    providerGuid: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
});
/**
 * A status report from the gateway.
 *
 * `dispatchToken` scopes the report to one specific attempt, so a report that
 * arrives after the lease was reaped and the message re-leased cannot corrupt
 * the newer attempt. `occurredAt` is when the gateway *observed* the change,
 * which is not when the server receives it.
 */
export const reportStatusSchema = z.object({
    dispatchToken: z.string().min(1),
    status: messageStatusSchema,
    providerGuid: z.string().optional(),
    occurredAt: z.coerce.date(),
    error: z.string().optional(),
});
export const heartbeatSchema = z.object({
    gatewayId: z.string().min(1),
    driver: z.string().min(1),
    version: z.string().min(1),
});
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
