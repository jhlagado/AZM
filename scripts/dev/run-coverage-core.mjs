#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const buildResult = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const COMMAND = 'npm';
const ARGS = [
  'exec',
  '--',
  'vitest',
  'run',
  '--coverage',
  '--passWithNoTests',
  'test/unit',
  'test/integration',
  'test/public_api_surface.test.ts',
  'test/helpers/diagnostics.test.ts',
];

const result = spawnSync(COMMAND, ARGS, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
