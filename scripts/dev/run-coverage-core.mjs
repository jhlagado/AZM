#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const COMMAND = 'npm';
const ARGS = [
  'exec',
  '--',
  'vitest',
  'run',
  '--coverage',
  'test/registerCare',
  'test/frontend',
  'test/semantics',
  'test/sourceLoader_asm_include.test.ts',
  'test/sourceLoader_include_paths.test.ts',
  'test/sourceLoader_asm_z80_include.test.ts',
  'test/cli/cli_contract_matrix.test.ts',
  'test/cli/cli_failure_contract_matrix.test.ts',
  'test/cli/cli_source_extension.test.ts',
  'test/cli/cli_acceptance_matrix_strictness.test.ts',
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
