import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

import { binaryFromListingRange, parseListingWrittenRange } from './listingRangeTools.mjs';

export function sourceStem(source) {
  return basename(source).replace(/\.(z80|asm)$/i, '');
}

export function copyAsm80SourceSiblings(source, outDir, extensions = /\.(z80|asm)$/i) {
  for (const entry of readdirSync(dirname(source), { withFileTypes: true })) {
    if (entry.isFile() && extensions.test(entry.name)) {
      copyFileSync(join(dirname(source), entry.name), join(outDir, entry.name));
    }
  }
}

export function compactSpawnError(result) {
  return [result.stdout, result.stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' | ');
}

export function runAsm80BinaryReference(source, asm80, options = {}) {
  const workDir = mkdtempSync(join(tmpdir(), options.tempPrefix ?? 'azm-asm80-reference-'));
  const outName = options.outputName ?? `${sourceStem(source)}.bin`;
  const sourceName = basename(source);
  const listingPath = join(workDir, `${sourceStem(source)}.lst`);
  try {
    copyAsm80SourceSiblings(source, workDir, options.extensions);
    const result = spawnSync(asm80, ['-m', 'Z80', '-t', 'bin', '-o', outName, sourceName], {
      cwd: workDir,
      encoding: 'utf8',
    });
    if (result.error) return { ok: false, message: result.error.message };
    if (result.status !== 0) return { ok: false, message: compactSpawnError(result) };

    const bytes = readFileSync(join(workDir, outName));
    const range =
      options.trimListingRange && existsSync(listingPath)
        ? parseListingWrittenRange(listingPath)
        : undefined;
    return { ok: true, bytes: range ? binaryFromListingRange(bytes, range) : bytes, range };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
