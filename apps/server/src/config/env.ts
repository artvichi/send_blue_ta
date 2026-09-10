import { z } from 'zod';

/**
 * Environment is parsed once, at startup, and fails loudly. A server that boots
 * with a missing DATABASE_URL and only discovers it on the first request is a
 * worse outcome than one that refuses to start.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4310),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CORS_ORIGIN: z.string().default('http://localhost:4320'),

  /** Shared secret the gateway presents. Never optional -- an unauthenticated
   *  lease endpoint would let anyone drain the queue. */
  GATEWAY_TOKEN: z.string().min(1, 'GATEWAY_TOKEN is required'),

  /** Seeded into the settings row on first boot only; afterwards the database
   *  is authoritative so runtime changes survive a restart. */
  DEFAULT_SEND_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3600),

  /** How long a claimed message stays invisible before the reaper reclaims it. */
  LEASE_SECONDS: z.coerce.number().int().positive().default(120),

  /** How often the ticker wakes to check whether the queue is due. */
  TICK_INTERVAL_MS: z.coerce.number().int().positive().default(1000),

  /** How often the reaper sweeps for expired leases. */
  REAP_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  /** A gateway unheard from for longer than this reads as offline. */
  GATEWAY_OFFLINE_AFTER_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test seam: drop the memoized environment. */
export function resetEnv(): void {
  cached = null;
}
