import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';
import { binBytes, containsSubsequence } from '../test-helpers.js';

function writeTempAzm(source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-enum-constants-'));
  const entry = join(dir, 'entry.azm');
  writeFileSync(entry, `${source.trim()}\n`, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('AZM enum constants', () => {
  it('uses qualified enum members as native AZM immediate constants', async () => {
    const { entry, cleanup } = writeTempAzm(`
enum Mode Read, Write, Append

const SELECTED = Mode.Write + 3

main:
  ld a,Mode.Append
  ld b,SELECTED
  ld c,Mode.Append + 1
  ld hl,(Mode.Append + 1)
  ld a,(ix+Mode.Append)
  ret
`);

    try {
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
      expect(
        containsSubsequence(binBytes(result.artifacts), [
          0x3e, 0x02, 0x06, 0x04, 0x0e, 0x03, 0x2a, 0x03, 0x00, 0xdd, 0x7e, 0x02, 0xc9,
        ]),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('rejects unqualified enum members in native AZM constants', async () => {
    const { entry, cleanup } = writeTempAzm(`
enum Mode Read, Write, Append

const BAD = Write

main:
  ld a,BAD
  ret
`);

    try {
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.artifacts).toEqual([]);
      expectDiagnostic(result.diagnostics, {
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: 'Unqualified enum member "Write" is not allowed; use "Mode.Write".',
      });
      expectDiagnostic(result.diagnostics, {
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: 'Failed to evaluate const "BAD".',
      });
    } finally {
      cleanup();
    }
  });

  it('keeps enum member names scoped by enum name in native AZM', async () => {
    const { entry, cleanup } = writeTempAzm(`
enum PlayerState Idle, Running
enum EnemyState Idle, Chasing

main:
  ld a,PlayerState.Idle
  ld b,EnemyState.Chasing
  ret
`);

    try {
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
      expect(containsSubsequence(binBytes(result.artifacts), [0x3e, 0x00, 0x06, 0x01, 0xc9])).toBe(
        true,
      );
    } finally {
      cleanup();
    }
  });

  it('uses qualified enum members in native AZM data and reserve directives', async () => {
    const { entry, cleanup } = writeTempAzm(`
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

    try {
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
      expect(
        containsSubsequence(binBytes(result.artifacts), [
          0x21, 0x04, 0x00, 0xc9, 0x00, 0x01, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x01,
        ]),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });
});
