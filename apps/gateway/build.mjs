import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Resolve every path against this file, not the caller's cwd: Nx runs it from
// apps/gateway while the Docker build runs it from the repo root.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** See apps/server/build.mjs for why this bundles rather than using tsc emit. */
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
  logLevel: 'info',
});
