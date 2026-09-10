import { z } from 'zod';

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
