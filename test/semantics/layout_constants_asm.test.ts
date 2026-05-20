import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'asm-layout-constants-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function compileSource(ext: string, lines: string[]) {
  const { entry, cleanup } = writeTempSource(ext, `${lines.join('\n')}\n`);
  try {
    return await compile(entry, {}, { formats: defaultFormatWriters });
  } finally {
    cleanup();
  }
}

function expectLdHlImmediate(bin: BinArtifact | undefined, value: number): void {
  expect(bin).toBeDefined();
  if (!bin) throw new Error('missing bin artifact');
  const bytes = Array.from(bin.bytes);
  const expected = [0x21, value & 0xff, (value >> 8) & 0xff];
  expect(
    bytes.some((_, index) => expected.every((byte, offset) => bytes[index + offset] === byte)),
  ).toBe(true);
}

function expectLdHlImmediates(bin: BinArtifact | undefined, values: number[]): void {
  expect(bin).toBeDefined();
  if (!bin) throw new Error('missing bin artifact');
  const bytes = Array.from(bin.bytes);
  const actual: number[] = [];
  for (let index = 0; index < bytes.length - 2; index += 1) {
    if (bytes[index] === 0x21) {
      actual.push(bytes[index + 1]! | (bytes[index + 2]! << 8));
    }
  }
  expect(actual.slice(0, values.length)).toEqual(values);
}

describe('.asm layout constant subset', () => {
  it('evaluates sizeof for named record layouts in .asm constants', async () => {
    const result = await compileSource('asm', [
      '.type Point',
      'x       .word',
      'y       .word',
      '.endtype',
      '',
      'SZ_POINT .equ sizeof(Point)',
      '',
      'main:',
      '  ld hl,SZ_POINT',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediate(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      4,
    );
  });

  it('evaluates assembler-style .type field layouts', async () => {
    const result = await compileSource('asm', [
      '.type Sprite',
      'x       .field 1',
      'y       .field 1',
      'timer   .word',
      'ptr     .addr',
      'blob    .field 3',
      '.endtype',
      '',
      'SIZE .equ sizeof(Sprite)',
      'PTR .equ offset(Sprite, ptr)',
      'BLOB .equ offset(Sprite, blob)',
      '',
      'main:',
      '  ld hl,SIZE',
      '  ld hl,PTR',
      '  ld hl,BLOB',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediates(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      [9, 4, 6],
    );
  });

  it('evaluates assembler-style .union layouts', async () => {
    const result = await compileSource('asm', [
      '.type Pair',
      'left    .byte',
      'right   .byte',
      '.endtype',
      '',
      '.union Cell',
      'raw     .word',
      'pair    .field 2',
      'tag     .byte',
      '.endunion',
      '',
      'CELL_SIZE .equ sizeof(Cell)',
      'TAG_OFFSET .equ offset(Cell, tag)',
      '',
      'main:',
      '  ld hl,CELL_SIZE',
      '  ld hl,TAG_OFFSET',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediates(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      [2, 0],
    );
  });

  it('evaluates exact sizeof for arrays of records', async () => {
    const result = await compileSource('asm', [
      '.type Sprite',
      'x       .byte',
      'y       .byte',
      'tile    .byte',
      'flags   .byte',
      '.endtype',
      '',
      'SIZE .equ sizeof(Sprite[16])',
      '',
      'main:',
      '  ld hl,SIZE',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediate(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      64,
    );
  });

  it('evaluates offset for array element field paths', async () => {
    const result = await compileSource('asm', [
      '.type Sprite',
      'x       .byte',
      'y       .byte',
      'tile    .byte',
      'flags   .byte',
      '.endtype',
      '',
      'OFFSET .equ offset(Sprite[16], [2].flags)',
      '',
      'main:',
      '  ld hl,OFFSET',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediate(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      11,
    );
  });

  it('evaluates union size and zero-offset union fields in .asm constants', async () => {
    const result = await compileSource('asm', [
      '.type Pair',
      'left    .byte',
      'right   .byte',
      '.endtype',
      '',
      '.union Cell',
      'raw     .word',
      'pair    .field Pair',
      'tag     .byte',
      '.endunion',
      '',
      'CELL_SIZE .equ sizeof(Cell)',
      'RAW_OFFSET .equ offset(Cell, raw)',
      'RIGHT_OFFSET .equ offset(Cell, pair.right)',
      '',
      'main:',
      '  ld hl,CELL_SIZE',
      '  ld hl,RAW_OFFSET',
      '  ld hl,RIGHT_OFFSET',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediates(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      [2, 0, 1],
    );
  });

  it('keeps non-power-of-two array element sizes exact in .asm constants', async () => {
    const result = await compileSource('asm', [
      '.type Tri',
      'a       .byte',
      'b       .byte',
      'c       .byte',
      '.endtype',
      '',
      '.type Row',
      'cells   .field Tri[4]',
      'tail    .byte',
      '.endtype',
      '',
      'TRI_SIZE .equ sizeof(Tri)',
      'THIRD_C .equ offset(Tri[4], [2].c)',
      'TAIL .equ offset(Row, tail)',
      '',
      'main:',
      '  ld hl,TRI_SIZE',
      '  ld hl,THIRD_C',
      '  ld hl,TAIL',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediates(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      [3, 8, 12],
    );
  });

  it('evaluates .asm constants from named constants and const expressions', async () => {
    const result = await compileSource('asm', [
      'BASE .equ 4',
      'STRIDE .equ 3',
      'INDEX .equ BASE + 2',
      'ADDRESS .equ $2000 + INDEX * STRIDE',
      '',
      'main:',
      '  ld hl,ADDRESS',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediate(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      0x2012,
    );
  });

  it('rejects unknown offsetof spelling in .asm source', async () => {
    const result = await compileSource('asm', [
      '.type Sprite',
      'x       .byte',
      'y       .byte',
      '.endtype',
      '',
      'X .equ offsetof(Sprite, x)',
      '',
      'main:',
      '  ld hl,X',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/Invalid imm expression|Failed to evaluate const/i),
      }),
    );
  });

  it('diagnoses unknown types used in .asm sizeof constants', async () => {
    const result = await compileSource('asm', [
      'SZ_NOPE .equ sizeof(Nope)',
      '',
      'main:',
      '  ld hl,SZ_NOPE',
      '  ret',
      '',
    ]);

    expect(result.artifacts).toEqual([]);
    expectDiagnostic(result.diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      message: 'Unknown type "Nope".',
    });
  });

  it('rejects runtime registers in layout constant paths', async () => {
    const result = await compileSource('asm', [
      '.type Sprite',
      'x       .byte',
      'y       .byte',
      '.endtype',
      '',
      'SPRITES .equ $2000',
      '',
      'main:',
      '  ld hl,<Sprite[16]>SPRITES[HL].x',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/runtime|not supported in .asm source/i),
      }),
    );
  });
});
