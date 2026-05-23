import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { BinArtifact } from '../../src/formats/types.js';
import type { CompileResult } from '../../src/pipeline.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import { compileTempSource } from '../helpers/temp_source.js';

async function compileSource(ext: string, lines: string[]): Promise<CompileResult> {
  return compileTempSource('asm-layout-constants-', ext, `${lines.join('\n')}\n`, {});
}

function binArtifact(result: CompileResult): BinArtifact | undefined {
  return result.artifacts.find((artifact): artifact is BinArtifact => artifact.kind === 'bin');
}

function expectNoErrorDiagnostics(result: CompileResult): void {
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
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

function expectBinBytes(bin: BinArtifact | undefined, expected: number[]): void {
  expect(bin).toBeDefined();
  if (!bin) throw new Error('missing bin artifact');
  expect(Array.from(bin.bytes)).toEqual(expected);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediate(binArtifact(result), 4);
  });

  it('emits abs16 fixups for symbolic LD immediates with constant offsets', async () => {
    const result = await compileSource('asm', [
      'main:',
      '  ld bc,Target + 1',
      '  ld de,Target - 2',
      '  ld ix,Target + 3',
      '  ld iy,Target + 4',
      '  ret',
      'Target:',
      '  .db 0',
      '',
    ]);

    expectNoErrorDiagnostics(result);
    expectBinBytes(
      binArtifact(result),
      [
        0x01, 0x10, 0x00, 0x11, 0x0d, 0x00, 0xdd, 0x21, 0x12, 0x00, 0xfd, 0x21, 0x13, 0x00, 0xc9,
        0x00,
      ],
    );
  });

  it('evaluates current-location relative branch targets', async () => {
    const result = await compileSource('asm', [
      'main:',
      '  jr nz,$+5',
      '  nop',
      '  nop',
      '  nop',
      '',
    ]);

    expectNoErrorDiagnostics(result);
    expectBinBytes(binArtifact(result), [0x20, 0x03, 0x00, 0x00, 0x00]);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediates(binArtifact(result), [9, 4, 6]);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediates(binArtifact(result), [2, 0]);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediate(binArtifact(result), 64);
  });

  it('uses type shorthand as .ds allocation size', async () => {
    const result = await compileSource('asm', [
      '.type Sprite',
      'x       .byte',
      'y       .byte',
      'flags   .byte',
      '.endtype',
      '',
      'OneByte:',
      '  .ds byte,$10',
      'Bytes:',
      '  .ds byte[4],$11',
      'OneWord:',
      '  .ds word,$20',
      'Words:',
      '  .ds word[3],$22',
      'OneSprite:',
      '  .ds Sprite,$30',
      'Sprites:',
      '  .ds Sprite[2],$33',
      '',
    ]);

    expectNoErrorDiagnostics(result);
    expect(Array.from(binArtifact(result)?.bytes ?? [])).toEqual([
      0x10, 0x11, 0x11, 0x11, 0x11, 0x20, 0x20, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x30, 0x30,
      0x30, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
    ]);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediate(binArtifact(result), 11);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediates(binArtifact(result), [2, 0, 1]);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediates(binArtifact(result), [3, 8, 12]);
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

    expectNoErrorDiagnostics(result);
    expectLdHlImmediate(binArtifact(result), 0x2012);
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

  it('rejects typed pointer syntax in layout fields', async () => {
    const result = await compileSource('asm', [
      '.type Node',
      'next    .field @Node',
      'value   .byte',
      '.endtype',
      '',
      'main:',
      '  ret',
      '',
    ]);

    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/record field declaration/i),
      }),
    );
  });

  it('points self-referential fields toward .addr', async () => {
    const result = await compileSource('asm', [
      '.type Node',
      'next    .field Node',
      'value   .byte',
      '.endtype',
      '',
      'main:',
      '  ret',
      '',
    ]);

    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message:
          'Self-referential field type "Node" has no finite size; use .addr for a pointer field.',
      }),
    );
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
