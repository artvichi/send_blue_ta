import { z } from 'zod';

export const MIN_INTERVAL_SECONDS = 5;
export const MAX_INTERVAL_SECONDS = 24 * 60 * 60;

export const MIN_ATTEMPTS = 1;
export const MAX_ATTEMPTS = 10;

export const settingsSchema = z.object({
  sendIntervalSeconds: z.number(),
  policy: z.string(),
  paused: z.boolean(),
  maxAttempts: z.number(),
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
    maxAttempts: z.coerce.number().int().min(MIN_ATTEMPTS).max(MAX_ATTEMPTS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
