import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sb/shared': fileURLToPath(new URL('../../libs/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 4320,
    strictPort: true,
  },
  build: { outDir: 'dist', sourcemap: true },
});
