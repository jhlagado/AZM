#!/usr/bin/env node
/**
 * CI/local gate: asm80 lowering coverage, promoted emitAsm80 self-checks, external
 * round-trip (when asm80 CLI verifies), and opt-in real-program lowering acceptance
 * (skipped when MON3/Tetro/Pacmo sources are absent).
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function run(label, command, args, env = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveAsm80Executable() {
  const fromEnv = process.env.ASM80?.trim() || process.env.ASM80_PATH?.trim();
  if (fromEnv) return fromEnv;
  const local = join(process.cwd(), 'node_modules', '.bin', 'asm80');
  if (existsSync(local)) return local;
  return undefined;
}

run('build', 'npm', ['run', 'build']);
run('check:asm80-coverage', 'npm', ['run', 'check:asm80-coverage']);

let asm80 = resolveAsm80Executable();
if (!asm80) {
  console.log('\n==> asm80 CLI not found; installing asm80@1.11.14 for round-trip');
  run('install asm80', 'npm', ['install', '--no-save', 'asm80@1.11.14']);
  asm80 = resolveAsm80Executable();
}
if (!asm80) {
  console.error('asm80 executable missing after install');
  process.exit(1);
}

const asm80Env = { ASM80: asm80 };

run('vitest: asm80 lowered output and external round-trip', 'npx', [
  'vitest',
  'run',
  'test/differential/lowered-asm80-artifact.test.ts',
  'test/differential/asm80-external-roundtrip.test.ts',
], asm80Env);

run(
  'vitest: emit_asm80 real-program acceptance (skip when sources absent)',
  'npx',
  ['vitest', 'run', 'test/asm80/emit_asm80_real_program_acceptance.test.ts'],
  {
    ...asm80Env,
    AZM_RUN_MON3_ASM80_ACCEPTANCE: '1',
    AZM_RUN_TETRO_ASM80_ACCEPTANCE: '1',
    AZM_RUN_PACMO_ASM80_ACCEPTANCE: '1',
  },
);
