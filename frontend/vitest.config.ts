import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    // Resource Guard: Throttle worker concurrency to prevent CPU contention and memory spikes
    pool: 'threads',
    maxWorkers: 4,
    testTimeout: 15000,
    // Exclude Playwright E2E and Pact contract tests — they run in their own separate runners
    exclude: [
      'e2e/**',
      'tests/contract/**',
      'node_modules/**',
    ],
  },
});
