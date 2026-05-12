#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { stdin as input } from 'node:process';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { classifyChangedPaths } from './change-classifier.js';

async function readPathsFromStdin() {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const values = [];
  for await (const line of rl) values.push(line);
  return values;
}

async function main() {
  const paths = await readPathsFromStdin();
  const { docsPaths } = classifyChangedPaths(paths);
  const existingDocsPaths = docsPaths.filter((p) => existsSync(p));
  const deletedDocsPaths = docsPaths.filter((p) => !existsSync(p));

  if (deletedDocsPaths.length > 0) {
    console.log(`[docs-fast] skipping deleted docs paths: ${deletedDocsPaths.join(', ')}`);
  }

  if (existingDocsPaths.length === 0) {
    console.log('[docs-fast] no existing docs paths changed; skipping prettier check');
    return;
  }

  const result = spawnSync('npx', ['prettier', '-c', ...existingDocsPaths], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await main();
