import { defineConfig } from 'prisma/config';

/**
 * Migration-time config; the runtime connects via the pg adapter in
 * src/db/prisma.ts.
 *
 * The datasource is attached only when DATABASE_URL is present. `generate` needs
 * no database and runs in the Docker build where none exists -- and Prisma's
 * env() helper throws on a missing variable, which broke the image build.
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
