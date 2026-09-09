import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/** See apps/server/build.mjs for why this bundles rather than using tsc emit. */
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  alias: {
    '@sb/shared': fileURLToPath(new URL('../../libs/shared/src/index.ts', import.meta.url)),
  },
  logLevel: 'info',
});
