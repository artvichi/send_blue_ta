import { defineConfig } from 'prisma/config';

/**
 * Migration- and introspection-time configuration. The runtime connection is
 * made separately, through the pg driver adapter in `src/db/prisma.ts`.
 *
 * The datasource is attached only when DATABASE_URL is actually present.
 * `prisma generate` needs no database -- it only reads the schema -- and it runs
 * during the Docker build, where no database exists. Prisma's own `env()` helper
 * throws on a missing variable, which broke the image build; reading
 * `process.env` directly keeps generate working while migrations still get the
 * URL whenever it is set.
 */
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(url ? { datasource: { url } } : {}),
});
