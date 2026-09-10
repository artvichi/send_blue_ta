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
  /** Null for the mock driver, which needs no macOS permissions. */
  fullDiskAccess: z.boolean().nullable(),
  automation: z.boolean().nullable(),
  hostApp: z.string().nullable(),
  /** True when the driver can actually send and report status. */
  ready: z.boolean(),
});

export type GatewayHealthDto = z.infer<typeof gatewayHealthSchema>;

export const activityBucketSchema = z.object({
  hour: z.string(),
  delivered: z.number(),
  failed: z.number(),
  inFlight: z.number(),
});

export const activitySchema = z.object({
  hours: z.number(),
  buckets: z.array(activityBucketSchema),
});

export type ActivityBucketDto = z.infer<typeof activityBucketSchema>;
export type ActivityDto = z.infer<typeof activitySchema>;
