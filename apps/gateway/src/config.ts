import { createRequire } from 'node:module';
import { z } from 'zod';

const envSchema = z.object({
  SERVER_URL: z.string().url().default('http://localhost:4310'),
  GATEWAY_TOKEN: z.string().min(1, 'GATEWAY_TOKEN is required'),
  GATEWAY_ID: z.string().min(1).default('local-gateway'),

  /**
   * `mock` simulates the whole lifecycle on timers and needs no macOS
   * permissions -- it is what lets CI, the integration tests and any reviewer
   * without a Mac run the system end to end.
   * `applescript` sends real iMessages and reads real delivery status.
   */
  GATEWAY_DRIVER: z.enum(['mock', 'applescript']).default('mock'),

  GATEWAY_POLL_WAIT_SECONDS: z.coerce.number().int().min(0).max(60).default(25),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),

  /** How often the applescript driver re-reads chat.db while watching a message. */
  CHATDB_POLL_MS: z.coerce.number().int().positive().default(2000),
  /** How long to keep watching one message for delivery/read before giving up. */
  CHATDB_WATCH_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),

  MOCK_STEP_MS: z.coerce.number().int().positive().default(1200),
  MOCK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type GatewayConfig = z.infer<typeof envSchema>;

let cached: GatewayConfig | null = null;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid gateway configuration:\n${issues}`);
  }
  return parsed.data;
}

export function config(): GatewayConfig {
  cached ??= loadConfig();
  return cached;
}

/** Reported in every heartbeat, so the dashboard can tell which build is talking. */
export const VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;
