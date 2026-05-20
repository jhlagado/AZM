#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mon3Source =
  process.env.MON3_SOURCE ?? '/Users/johnhardy/Documents/projects/MON3/src/mon3.z80';
const tec1gSoftwareRoot =
  process.env.TEC1G_SOFTWARE_ROOT ?? '/Users/johnhardy/Documents/projects/TEC-1G/Software';

function normalizeExecutableCandidate(candidate) {
  return candidate.includes('/') || candidate.includes('\\') ? resolve(candidate) : candidate;
}

function findAsm80() {
  const candidates = [
    process.env.ASM80,
    process.env.ASM80_PATH,
    '/Users/johnhardy/Documents/projects/debug80/node_modules/.bin/asm80',
    'asm80',
  ]
    .filter((candidate) => candidate && candidate.trim().length > 0)
    .map(normalizeExecutableCandidate);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-h'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (!probe.error) return candidate;
  }
  return undefined;
}

const commands = [
  {
    label: 'build AZM CLI',
    command: 'npm',
    args: ['run', 'build'],
    env: {},
  },
  {
    label: 'MON3 ASM80 acceptance',
    command: 'npx',
    args: ['vitest', 'run', 'test/asm80/mon3_acceptance.test.ts'],
    env: { ZAX_RUN_MON3_ACCEPTANCE: '1' },
  },
  {
    label: 'TEC-1G ASM80 corpus comparison',
    command: 'node',
    args: ['scripts/dev/compare-tec1g-corpus.mjs', tec1gSoftwareRoot],
    env: {},
  },
];

function runStep(step) {
  console.log(`\n==> ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...step.env },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

if (!existsSync(mon3Source)) {
  console.error(`MON3 source not found: ${mon3Source}`);
  console.error('Set MON3_SOURCE to override the local MON3 entry path.');
  process.exit(1);
}

if (!existsSync(tec1gSoftwareRoot)) {
  console.error(`TEC-1G software root not found: ${tec1gSoftwareRoot}`);
  console.error('Set TEC1G_SOFTWARE_ROOT to override the local TEC-1G software path.');
  process.exit(1);
}

if (!findAsm80()) {
  console.error('asm80 executable not found. Set ASM80 or ASM80_PATH.');
  process.exit(1);
}

for (const step of commands) {
  const status = runStep(step);
  if (status !== 0) {
    console.error(`\nASM80 baseline failed at: ${step.label}`);
    process.exit(status);
  }
}

console.log('\nASM80 baseline passed.');
