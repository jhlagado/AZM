import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import {
  binaryFromListingRange,
  copySourceRoot,
  findAsm80Executable,
  findFirstMismatch,
  parseListingWrittenRange,
  runAsm80Reference,
  summarizeBinaryMismatch,
  summarizeDiagnostics,
} from '../helpers/index.js';

const manifest = {
  source: process.env.TETRO_SOURCE ?? '/Users/johnhardy/Documents/projects/tetro/src/tetro.asm',
};

const asm80 = findAsm80Executable();
const tetroFilesAvailable = existsSync(manifest.source);
const runTetroAcceptance = process.env.ZAX_RUN_TETRO_ACCEPTANCE === '1';
const describeTetro = tetroFilesAvailable && asm80 && runTetroAcceptance ? describe : describe.skip;

function buildAsm80Reference(source: string): Buffer {
  return runAsm80Reference({
    asm80,
    source,
    tempPrefix: 'zax-tetro-asm80-reference-',
    outputName: 'tetro-reference.bin',
    prepareSourceTree: copySourceRoot,
    transformOutput: (bytes, outDir) =>
      binaryFromListingRange(bytes, parseListingWrittenRange(join(outDir, 'tetro-reference.lst'))),
  });
}

describeTetro('ASM80 Tetro acceptance', () => {
  it('compiles Tetro and matches a fresh ASM80-built reference binary', async () => {
    const res = await compile(
      manifest.source,
      { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
      { formats: defaultFormatWriters },
    );
    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) throw new Error(summarizeDiagnostics(res.diagnostics));

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');

    const actual = Buffer.from(bin.bytes);
    const expected = buildAsm80Reference(manifest.source);
    const binarySummary = summarizeBinaryMismatch(actual, expected);

    if (actual.length !== expected.length || findFirstMismatch(actual, expected) !== -1) {
      throw new Error(binarySummary);
    }
  });
});

if (runTetroAcceptance && !tetroFilesAvailable) {
  describe('ASM80 Tetro acceptance', () => {
    it('requires the local Tetro source when opt-in acceptance is enabled', () => {
      throw new Error(`Tetro source is unavailable: ${manifest.source}`);
    });
  });
} else if (runTetroAcceptance && !asm80) {
  describe('ASM80 Tetro acceptance', () => {
    it('requires asm80 when opt-in acceptance is enabled', () => {
      throw new Error('asm80 executable is unavailable. Set ASM80 or ASM80_PATH.');
    });
  });
} else if (!tetroFilesAvailable) {
  describe('ASM80 Tetro acceptance', () => {
    it.todo('skipped: local Tetro source is unavailable');
  });
} else if (!asm80) {
  describe('ASM80 Tetro acceptance', () => {
    it.todo('skipped: asm80 executable is unavailable');
  });
} else if (!runTetroAcceptance) {
  describe('ASM80 Tetro acceptance', () => {
    it.todo('set ZAX_RUN_TETRO_ACCEPTANCE=1 to run the local Tetro acceptance check');
  });
}
