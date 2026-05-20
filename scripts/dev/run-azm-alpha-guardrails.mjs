#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['run', 'build']],
  [
    'npx',
    [
      'vitest',
      'run',
      // AZM alpha stays assembler-focused: ASM80-compatible assembly plus the
      // retained AZM extensions.
      'test/registerCare',
      'test/frontend/azm_flat_source_asm.test.ts',
      'test/frontend/azm_native_boundary.test.ts',
      'test/frontend/azm_native_top_level_parser.test.ts',
      'test/frontend/azm_enum_constants.test.ts',
      'test/frontend/azm_source_mode_removals.test.ts',
      'test/semantics/layout_cast_constants_azm.test.ts',
      'test/semantics/layout_cast_fold.test.ts',
      'test/semantics/layout_constants_azm.test.ts',
      'test/semantics/semantics_layout.test.ts',
      'test/semantics/semantics_layout_extra.test.ts',
      'test/semantics/layout_edge_cases.test.ts',
      'test/registerCare/opExpansion.integration.test.ts',
      'test/frontend/directiveAliases.test.ts',
      'test/sourceLoader_asm80_include.test.ts',
      'test/sourceLoader_azm_include.test.ts',
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
