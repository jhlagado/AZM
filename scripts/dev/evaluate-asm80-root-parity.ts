#!/usr/bin/env node
/**
 * One-off helper: compare legacy current vs Next emitAsm80 text for all root fixtures.
 * Usage: npx tsx scripts/dev/evaluate-asm80-root-parity.ts
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCurrentAzmFixture } from '../../test/differential/current-azm-runner.js';
import { runNextAzmFixture } from '../../test/differential/next-azm-runner.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixtureDir = path.join(repoRoot, 'test/fixtures');
const includeDir = path.join(fixtureDir, 'includes');

const files = (await readdir(fixtureDir))
  .filter((f) => f.toLowerCase().endsWith('.asm'))
  .sort((a, b) => a.localeCompare(b));

const parity: string[] = [];
const excludedReason = {
  compileFail: [] as { file: string; current: number; next: number }[],
  noAsm80: [] as string[],
  mismatch: [] as {
    file: string;
    firstDiff: number;
    currentLine: string;
    nextLine: string;
  }[],
};

for (const file of files) {
  const fixturePath = path.join(fixtureDir, file);
  const current = await runCurrentAzmFixture(fixturePath, [includeDir], { emitAsm80: true });
  const next = await runNextAzmFixture(fixturePath, [includeDir], { emitAsm80: true });

  if (current.exitCode !== 0 || next.exitCode !== 0) {
    excludedReason.compileFail.push({
      file,
      current: current.exitCode,
      next: next.exitCode,
    });
    continue;
  }

  if (!current.asm80Text?.includes('; AZM lowered ASM80 output')) {
    excludedReason.noAsm80.push(file);
    continue;
  }

  if (next.asm80Text === current.asm80Text) {
    parity.push(file);
  } else {
    const curLines = current.asm80Text.split('\n');
    const nextLines = (next.asm80Text ?? '').split('\n');
    let firstDiff = -1;
    for (let i = 0; i < Math.max(curLines.length, nextLines.length); i++) {
      if (curLines[i] !== nextLines[i]) {
        firstDiff = i;
        break;
      }
    }
    excludedReason.mismatch.push({
      file,
      firstDiff: firstDiff + 1,
      currentLine: curLines[firstDiff] ?? '<eof>',
      nextLine: nextLines[firstDiff] ?? '<eof>',
    });
  }
}

console.log(
  JSON.stringify({ total: files.length, parity: parity.length, parity, excludedReason }, null, 2),
);
