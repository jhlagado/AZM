import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import {
  copyZ80Siblings,
  findAsm80Executable,
  findFirstMismatch,
  runAsm80Reference,
  summarizeBinaryMismatch,
  summarizeDiagnostics,
} from '../helpers/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');
const classicParserPath = join(repoRoot, 'src', 'frontend', 'asm80', 'parseClassicModule.ts');
const classicAsm80Available = existsSync(classicParserPath);
const classicModuleLoweringAvailable = true;
const manifest = {
  source: process.env.MON3_SOURCE ?? '/Users/johnhardy/Documents/projects/MON3/src/mon3.z80',
};

const asm80 = findAsm80Executable();
const mon3FilesAvailable = existsSync(manifest.source);
const runMon3Acceptance = process.env.ZAX_RUN_MON3_ACCEPTANCE === '1';
const describeMon3 =
  classicAsm80Available &&
  classicModuleLoweringAvailable &&
  mon3FilesAvailable &&
  asm80 &&
  runMon3Acceptance
    ? describe
    : describe.skip;

function buildAsm80Reference(source: string): Buffer {
  return runAsm80Reference({
    asm80,
    source,
    tempPrefix: 'zax-mon3-asm80-reference-',
    outputName: 'mon3-reference.bin',
    prepareSourceTree: copyZ80Siblings,
  });
}

describe('MON3 acceptance failure summaries', () => {
  it('summarizes diagnostics and byte mismatches concisely', () => {
    expect(
      summarizeDiagnostics([
        {
          id: 'ZAX100',
          severity: 'error',
          message: 'Unsupported classic instruction',
          file: '/tmp/mon3.z80',
          line: 12,
          column: 5,
        },
        {
          id: 'ZAX200',
          severity: 'warning',
          message: 'Unused label',
          file: '/tmp/lib.z80',
        },
        {
          id: 'ZAX300',
          severity: 'error',
          message: 'Another error',
          file: '/tmp/lib.z80',
          line: 40,
          column: 1,
        },
        {
          id: 'ZAX301',
          severity: 'error',
          message: 'Suppressed error',
          file: '/tmp/lib.z80',
          line: 41,
          column: 1,
        },
      ]),
    ).toBe(
      [
        'Diagnostics preview (showing 3 of 4):',
        '/tmp/mon3.z80:12:5: error [ZAX100] Unsupported classic instruction',
        '/tmp/lib.z80: warning [ZAX200] Unused label',
        '/tmp/lib.z80:40:1: error [ZAX300] Another error',
      ].join('\n'),
    );

    expect(
      summarizeBinaryMismatch(Buffer.from([0x00, 0x02]), Buffer.from([0x00, 0x01, 0x03])),
    ).toBe(
      'Binary length: actual=2 reference=3\nFirst mismatch @0x0001: actual=0x02 reference=0x01',
    );
  });
});

describeMon3('ASM80 MON3 acceptance', () => {
  it('compiles MON3 and matches a fresh ASM80-built reference binary', async () => {
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

if (runMon3Acceptance && !mon3FilesAvailable) {
  describe('ASM80 MON3 acceptance', () => {
    it('requires the local MON3 source when opt-in acceptance is enabled', () => {
      throw new Error(`MON3 source is unavailable: ${manifest.source}`);
    });
  });
} else if (runMon3Acceptance && !asm80) {
  describe('ASM80 MON3 acceptance', () => {
    it('requires asm80 when opt-in acceptance is enabled', () => {
      throw new Error('asm80 executable is unavailable. Set ASM80 or ASM80_PATH.');
    });
  });
} else if (!classicAsm80Available || !classicModuleLoweringAvailable) {
  describe('ASM80 MON3 acceptance', () => {
    it.todo('BLOCKED: enable when classic ASM80 module parsing/lowering is wired into compile()');
  });
} else if (!mon3FilesAvailable) {
  describe('ASM80 MON3 acceptance', () => {
    it.todo('skipped: local MON3 source is unavailable');
  });
} else if (!asm80) {
  describe('ASM80 MON3 acceptance', () => {
    it.todo('skipped: asm80 executable is unavailable');
  });
} else if (!runMon3Acceptance) {
  describe('ASM80 MON3 acceptance', () => {
    it.todo('set ZAX_RUN_MON3_ACCEPTANCE=1 to run the local MON3 byte-for-byte acceptance check');
  });
}
