import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), cloudflare({
    persistState: { path: process.env.LCS_VITE_PERSIST_PATH ?? './.wrangler/state/react' },
  })],
  publicDir: 'build/public',
  server: {
    host: '0.0.0.0',
    port: 8788,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 8789,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
