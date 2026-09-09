import { defineConfig, env } from 'prisma/config';

/**
 * Migration- and introspection-time configuration. The runtime connection is
 * made separately, through the pg driver adapter in `src/db/prisma.ts`.
 *
 * DATABASE_URL is supplied by the Nx target, which sources the single root
 * `.env` before invoking the CLI.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
