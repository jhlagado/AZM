#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CORPUS_ROOTS = [
  { name: 'tetro', paths: [join(homedir(), 'projects', 'tetro')] },
  { name: 'pacmo', paths: [join(homedir(), 'projects', 'pacmo')] },
  { name: 'MON3', paths: [join(homedir(), 'projects', 'MON3'), join(homedir(), 'projects', 'mon3')] },
];

const CORPUS_CHECKS = [
  {
    repo: 'tetro',
    entry: 'src/main.asm',
  },
  {
    repo: 'pacmo',
    entry: 'src/main.asm',
  },
  {
    repo: 'MON3',
    entry: 'src/main.asm',
  },
];

function resolveRepoRoot(spec) {
  for (const root of spec.paths) {
    if (existsSync(root)) return root;
  }
  return undefined;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
}

function skip(repo, reason) {
  console.log(`SKIP ${repo}: ${reason}`);
}

let failed = false;

const build = run('npm', ['run', 'build']);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

for (const spec of CORPUS_ROOTS) {
  const root = resolveRepoRoot(spec);
  if (!root) {
    skip(spec.name, 'repository not found locally');
    continue;
  }

  const checks = CORPUS_CHECKS.filter((check) => check.repo === spec.name);
  if (checks.length === 0) {
    skip(spec.name, 'no checks configured');
    continue;
  }

  for (const check of checks) {
    const entry = join(root, check.entry);
    if (!existsSync(entry)) {
      skip(spec.name, `no known entry point configured (${check.entry})`);
      continue;
    }

    console.log(`CHECK ${spec.name}: ${entry}`);
    const result = run('node', ['dist/src/cli.js', entry, '--emit-bin'], { cwd: process.cwd() });
    if (result.status !== 0) {
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
