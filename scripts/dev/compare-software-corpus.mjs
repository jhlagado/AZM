#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const defaultRoot = '/Users/johnhardy/Documents/projects/Software/magazine_code';
const root = process.argv[2] ?? defaultRoot;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    [
      'Usage: node scripts/dev/compare-software-corpus.mjs [software-slice-root]',
      '',
      `Default software slice root: ${defaultRoot}`,
      'This is an exploratory audit helper. It is not part of npm run test:asm80:baseline.',
    ].join('\n'),
  );
  process.exit(0);
}

if (process.argv.length > 3) {
  console.error('Usage: node scripts/dev/compare-software-corpus.mjs [software-slice-root]');
  process.exit(2);
}

if (!existsSync(root)) {
  console.error(`Software corpus root not found: ${root}`);
  process.exit(1);
}

const script = resolve('scripts/dev/compare-tec1g-corpus.mjs');
const result = spawnSync(process.execPath, [script, root], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
