import { defineConfig } from 'vitest/config';

// Relative base so the production build also works from a sub-path
// (e.g. GitHub Pages or a plain file server).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
