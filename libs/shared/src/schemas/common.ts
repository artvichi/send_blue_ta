import { z } from 'zod';
import { MESSAGE_STATUSES } from '../status.js';

/** A sanity bound, not a protocol limit. */
export const MAX_BODY_LENGTH = 2000;

export const messageStatusSchema = z.enum(MESSAGE_STATUSES);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
