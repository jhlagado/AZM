#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { zaxRetirementTests } from './zax-retirement-test-list.mjs';

const args = [
  'vitest',
  'run',
  '--coverage',
  '--exclude',
  'test/cli_*.test.ts',
  '--exclude',
  'test/cli/**/*.test.ts',
];

for (const test of zaxRetirementTests) {
  args.push('--exclude', test);
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
