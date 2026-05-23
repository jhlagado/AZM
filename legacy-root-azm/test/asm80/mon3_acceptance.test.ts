import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  copyZ80Siblings,
  defineAsm80CorpusAcceptance,
  findAsm80Executable,
  runAsm80Reference,
  summarizeBinaryMismatch,
  summarizeDiagnostics,
} from '../helpers/index.js';

const asmSourceLoweringAvailable = true;
const manifest = {
  source: process.env.MON3_SOURCE ?? '/Users/johnhardy/projects/MON3/src/mon3.z80',
};

const asm80 = findAsm80Executable();
const mon3FilesAvailable = existsSync(manifest.source);
const runMon3Acceptance = process.env.AZM_RUN_MON3_ACCEPTANCE === '1';

function buildAsm80Reference(source: string): Buffer {
  return runAsm80Reference({
    asm80,
    source,
    tempPrefix: 'azm-mon3-asm80-reference-',
    outputName: 'mon3-reference.bin',
    prepareSourceTree: copyZ80Siblings,
  });
}

describe('MON3 acceptance failure summaries', () => {
  it('summarizes diagnostics and byte mismatches concisely', () => {
    expect(
      summarizeDiagnostics([
        {
          id: 'AZM100',
          severity: 'error',
          message: 'Unsupported ASM80 instruction',
          file: '/tmp/mon3.z80',
          line: 12,
          column: 5,
        },
        {
          id: 'AZM200',
          severity: 'warning',
          message: 'Unused label',
          file: '/tmp/lib.z80',
        },
        {
          id: 'AZM300',
          severity: 'error',
          message: 'Another error',
          file: '/tmp/lib.z80',
          line: 40,
          column: 1,
        },
        {
          id: 'AZM301',
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
        '/tmp/mon3.z80:12:5: error [AZM100] Unsupported ASM80 instruction',
        '/tmp/lib.z80: warning [AZM200] Unused label',
        '/tmp/lib.z80:40:1: error [AZM300] Another error',
      ].join('\n'),
    );

    expect(
      summarizeBinaryMismatch(Buffer.from([0x00, 0x02]), Buffer.from([0x00, 0x01, 0x03])),
    ).toBe(
      'Binary length: actual=2 reference=3\nFirst mismatch @0x0001: actual=0x02 reference=0x01',
    );
  });
});

defineAsm80CorpusAcceptance({
  name: 'MON3',
  source: manifest.source,
  sourceAvailable: mon3FilesAvailable,
  asm80,
  runAcceptance: runMon3Acceptance,
  buildReference: buildAsm80Reference,
  blockedReason: asmSourceLoweringAvailable
    ? undefined
    : 'BLOCKED: enable when ASM80 source parsing/lowering is wired into compile()',
  optInHint: 'set AZM_RUN_MON3_ACCEPTANCE=1 to run the local MON3 byte-for-byte acceptance check',
});
