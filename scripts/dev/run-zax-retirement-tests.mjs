#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { zaxRetirementTests } from './zax-retirement-test-list.mjs';

const result = spawnSync('npx', ['vitest', 'run', ...zaxRetirementTests], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
