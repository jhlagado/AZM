import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { CompileResult } from '../../src/pipeline.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { binBytes, containsSubsequence } from '../test-helpers.js';

function writeTempAsm(source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'asm-enum-constants-'));
  const entry = join(dir, 'entry.asm');
  writeFileSync(entry, `${source.trim()}\n`, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function compileTempAsm(source: string): Promise<CompileResult> {
  const { entry, cleanup } = writeTempAsm(source);
  try {
    return await compile(entry, {}, { formats: defaultFormatWriters });
  } finally {
    cleanup();
  }
}

function expectNoCompileErrors(result: CompileResult): void {
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
}

function expectBytesContain(result: CompileResult, bytes: number[]): void {
  expect(containsSubsequence(binBytes(result.artifacts), bytes)).toBe(true);
}

describe('.asm enum constants', () => {
  it('uses qualified enum members as .asm immediate constants', async () => {
    const result = await compileTempAsm(`
enum Mode Read, Write, Append

SELECTED .equ Mode.Write + 3

main:
  ld a,Mode.Append
  ld b,SELECTED
  ld c,Mode.Append + 1
  ld hl,(Mode.Append + 1)
  ld a,(ix+Mode.Append)
  ret
`);

    expectNoCompileErrors(result);
    expectBytesContain(
      result,
      [0x3e, 0x02, 0x06, 0x04, 0x0e, 0x03, 0x2a, 0x03, 0x00, 0xdd, 0x7e, 0x02, 0xc9],
    );
  });

  it('rejects unqualified enum members in .asm constants', async () => {
    const result = await compileTempAsm(`
enum Mode Read, Write, Append

BAD .equ Write

main:
  ld a,BAD
  ret
`);

    expect(result.artifacts).toEqual([]);
    expectDiagnostic(result.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Enum member "Write" must be qualified.',
    });
  });

  it('keeps enum member names scoped by enum name in .asm source', async () => {
    const result = await compileTempAsm(`
enum PlayerState Idle, Running
enum EnemyState Idle, Chasing

main:
  ld a,PlayerState.Idle
  ld b,EnemyState.Chasing
  ret
`);

    expectNoCompileErrors(result);
    expectBytesContain(result, [0x3e, 0x00, 0x06, 0x01, 0xc9]);
  });

  it('uses qualified enum members in .asm data and reserve directives', async () => {
    const result = await compileTempAsm(`
enum Tile Empty, Wall, Pill, Power
enum Count None, One, Two

CELL_COUNT .equ Count.Two + 1

main:
  ld hl,TILES
  ret

TILES:
  .db Tile.Empty,Tile.Wall,Tile.Pill,Tile.Power
  .dw Tile.Power + 1
SCRATCH:
  .ds CELL_COUNT
AFTER:
  .db Count.One
`);

    expectNoCompileErrors(result);
    expectBytesContain(
      result,
      [0x21, 0x04, 0x00, 0xc9, 0x00, 0x01, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x01],
    );
  });
});
