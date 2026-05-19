#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['run', 'build']],
  [
    'npx',
    [
      'vitest',
      'run',
      // AZM alpha stays assembler-focused; high-level .zax compatibility has its own lane.
      'test/registerCare',
      'test/frontend/azm_flat_module_asm.test.ts',
      'test/frontend/azm_native_boundary.test.ts',
      'test/frontend/azm_source_mode_deprecations.test.ts',
      'test/semantics/layout_cast_constants_azm.test.ts',
      'test/semantics/layout_constants_azm.test.ts',
      'test/registerCare/opExpansion.integration.test.ts',
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
