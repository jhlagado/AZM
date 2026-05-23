#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['run', 'build']],
  [
    'npx',
    [
      'vitest',
      'run',
      '--passWithNoTests',
      'test/unit',
      'test/integration',
      'test/helpers/diagnostics.test.ts',
    ],
  ],
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
