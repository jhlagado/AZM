import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/helpers/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 300_000,
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/**/*.ts'],
    thresholds: {
      // Raised baseline to reflect current suite health.
      statements: 70,
      branches: 60,
      functions: 75,
      lines: 70,
    },
  },
});
