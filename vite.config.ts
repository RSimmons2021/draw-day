import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base` must match the GitHub Pages sub-path (https://<user>.github.io/<repo>/).
// Overridable so `npm run dev` and any other host still resolve assets correctly.
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/draw-day/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
