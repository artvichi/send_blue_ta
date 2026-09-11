import { z } from 'zod';
import { parseHandle } from '../handle.js';

export const MAX_RECIPIENT_NAME_LENGTH = 80;

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(MAX_RECIPIENT_NAME_LENGTH, `Keep it under ${MAX_RECIPIENT_NAME_LENGTH} characters`);

const toSchema = z.string().superRefine((value, ctx) => {
  const parsed = parseHandle(value);
  if (!parsed.ok) ctx.addIssue({ code: 'custom', message: parsed.reason });
});

export const createRecipientSchema = z.object({ name: nameSchema, to: toSchema });
export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;

export const updateRecipientSchema = z
  .object({ name: nameSchema.optional(), to: toSchema.optional() })
  .refine((v) => v.name !== undefined || v.to !== undefined, 'Nothing to update');
export type UpdateRecipientInput = z.infer<typeof updateRecipientSchema>;

export const listRecipientsQuerySchema = z.object({
  /** Matches name or handle, case-insensitively. */
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListRecipientsQuery = z.infer<typeof listRecipientsQuerySchema>;

export const recipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The normalized identity: E.164 or a lowercased Apple ID email. */
  handle: z.string(),
  kind: z.enum(['phone', 'email']),
  /** How many messages have been addressed to this handle, in any status. */
  messageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecipientDto = z.infer<typeof recipientSchema>;

export const recipientListSchema = z.object({ items: z.array(recipientSchema) });
