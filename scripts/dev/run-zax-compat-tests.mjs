#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const tests = [
  'test/pr770_typed_reinterpretation_integration.test.ts',
  'test/pr781_ld_typed_storage_migration_diag.test.ts',
  'test/pr863_assignment_lowering.test.ts',
  'test/pr869_assignment_reg8_integration.test.ts',
  'test/pr875_assignment_ixiy_integration.test.ts',
  'test/pr887_assignment_half_index_integration.test.ts',
  'test/semantics/pr895_assignment_acceptance.test.ts',
  'test/pr896_assignment_ea_ea_integration.test.ts',
  'test/pr1049_record_named_init_data_lowering.test.ts',
  'test/lowering/pr1334_typed_aggregate_local.test.ts',
  'test/lowering/pr1340_aggregate_param.test.ts',
  'test/lowering/pr1344_addr_of_type.test.ts',
];

const result = spawnSync('npx', ['vitest', 'run', ...tests], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
