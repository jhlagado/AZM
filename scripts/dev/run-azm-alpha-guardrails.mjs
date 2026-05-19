#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['run', 'build']],
  [
    'npx',
    [
      'vitest',
      'run',
      'test/registerCare',
      'test/frontend/directiveAliases.test.ts',
      'test/moduleLoader_asm80_include.test.ts',
      'test/asm80/asm80_directives_integration.test.ts',
      'test/asm80/asm80_equ_aliases.test.ts',
      'test/asm80/asm80_string_directives.test.ts',
      'test/asm80/asm80_align_directive.test.ts',
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
