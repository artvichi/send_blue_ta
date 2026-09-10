import { z } from 'zod';
import { parsePhone } from '../phone.js';
import { MAX_BODY_LENGTH, messageStatusSchema } from './common.js';

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

// Representations returned to clients

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
