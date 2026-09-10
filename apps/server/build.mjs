import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Resolve every path against this file, not the caller's cwd: Nx runs it from
// apps/server while the Docker build runs it from the repo root.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Bundle rather than `tsc --outDir`.
 *
 * `@sb/shared` is a workspace package imported through a path alias. tsc does
 * not rewrite path aliases on emit, so a tsc build would produce JavaScript that
 * still imports "@sb/shared" and fails to resolve at runtime. Bundling resolves
 * the alias and inlines the library, which is what we want for a deployable
 * artifact anyway.
 *
 * Everything in node_modules stays external: the Prisma client ships a native
 * query engine and must not be bundled.
 */
await build({
  entryPoints: [here('src/main.ts')],
  outfile: here('dist/main.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  alias: {
    '@sb/shared': here('../../libs/shared/src/index.ts'),
  },
  // The Prisma client is generated into src/, so it would otherwise be inlined
  // along with the rest of the source tree.
  external: ['./src/db/generated/*', '@prisma/*'],
  // Keep the generated-client import relative to dist/, wherever we were invoked from.
  absWorkingDir: here('.'),
  logLevel: 'info',
});
