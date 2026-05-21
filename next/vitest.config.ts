import { defineConfig } from 'vitest/config';

const runningFromNext = process.cwd().endsWith('/next');

export default defineConfig({
  test: {
    include: [runningFromNext ? 'test/**/*.test.ts' : 'next/test/**/*.test.ts'],
  },
});
