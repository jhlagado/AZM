import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/helpers/setup.ts'],
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: [
      'src/frontend/ast.ts',
      'src/diagnosticTypes.ts',
      'src/formats/types.ts',
      'src/pipeline.ts',
    ],
    thresholds: {
      // Raised baseline to reflect current suite health.
      statements: 70,
      branches: 60,
      functions: 75,
      lines: 70,
    },
  },
});
