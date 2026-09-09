import { defineConfig } from 'vitest/config';

/**
 * Two projects, because the two suites have very different costs.
 *
 *   unit        -- pure logic, no database, milliseconds. Runs on every commit.
 *   integration -- real Postgres, exercises the concurrency guarantees that are
 *                  the entire point of the claim query. Runs in CI and on demand.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/**/*.int.spec.ts'],
          fileParallelism: false,
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
