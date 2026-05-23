import { describe, expect, it } from 'vitest';

import type { CompileResult } from '../../src/pipeline.js';
import { compileTempSource, withTempSource } from '../helpers/temp_source.js';
import { compilePlacedProgram } from '../helpers/lowered_program_compile.js';
import { findRawAbs16Target } from '../helpers/lowered_program_symbols.js';
import type { CompiledLoweredProgram } from '../helpers/lowered_program_types.js';

function sourceFromLines(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

async function compilePlacedFromLines(lines: string[]): Promise<CompiledLoweredProgram> {
  return withTempSource('asm-layout-cast-', 'asm', sourceFromLines(lines), compilePlacedProgram);
}

async function compileAsmFromLines(lines: string[]): Promise<CompileResult> {
  return compileTempSource('asm-layout-cast-', 'asm', sourceFromLines(lines), {});
}

function expectNoErrorDiagnostics(result: Pick<CompileResult, 'diagnostics'>): void {
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
}

function expectLdHlFixup(lowered: CompiledLoweredProgram, target: string, addend: number): void {
  const match = findRawAbs16Target(lowered, { opcode: 0x21, target, addend });
  expect(match).toBeDefined();
}

function expectLdAAbsFixup(lowered: CompiledLoweredProgram, target: string, addend: number): void {
  const match = findRawAbs16Target(lowered, { opcode: 0x3a, target, addend });
  expect(match).toBeDefined();
}

const spriteType = [
  '.type Sprite',
  'x     .byte',
  'y     .byte',
  'tile  .byte',
  'flags .byte',
  '.endtype',
  '',
];

const spriteBase = ['SPRITES .equ $2000', ''];

describe('.asm layout-cast constant folding', () => {
  it('folds field access after a layout cast into an immediate address', async () => {
    const lowered = await compilePlacedFromLines([
      '.type Pos',
      'x .byte',
      'y .byte',
      '.endtype',
      '',
      '.type Sprite',
      'tile .byte',
      'pos  .field Pos',
      '.endtype',
      '',
      'PLAYER .equ $2000',
      '',
      'main:',
      '  ld hl,<Sprite>PLAYER.pos.x',
      '  ret',
      '',
    ]);

    expectNoErrorDiagnostics(lowered);
    expectLdHlFixup(lowered, 'PLAYER', 1);
  });

  it('folds a constant array layout cast into an immediate address', async () => {
    const lowered = await compilePlacedFromLines([
      ...spriteType,
      'BASE .equ 2',
      '',
      ...spriteBase,
      'main:',
      '  ld hl,<Sprite[16]>SPRITES[BASE + 1].flags',
      '  ret',
      '',
    ]);

    expectNoErrorDiagnostics(lowered);
    expectLdHlFixup(lowered, 'SPRITES', 15);
  });

  it('folds a constant layout cast in memory operands', async () => {
    const lowered = await compilePlacedFromLines([
      ...spriteType,
      ...spriteBase,
      'main:',
      '  ld a,(<Sprite[16]>SPRITES[3].flags)',
      '  ret',
      '',
    ]);

    expectNoErrorDiagnostics(lowered);
    expectLdAAbsFixup(lowered, 'SPRITES', 15);
  });

  it('folds array indexing through a record field after a layout cast', async () => {
    const lowered = await compilePlacedFromLines([
      '.type Pos',
      'x .byte',
      'y .byte',
      '.endtype',
      '',
      '.type Sprite',
      'tile .byte',
      'pos  .field Pos',
      '.endtype',
      '',
      '.type World',
      'header  .word',
      'sprites .field Sprite[8]',
      '.endtype',
      '',
      'BASE .equ 2',
      'GAME .equ $2000',
      '',
      'main:',
      '  ld hl,<World>GAME.sprites[BASE + 1].pos.x',
      '  ret',
      '',
    ]);

    expectNoErrorDiagnostics(lowered);
    expectLdHlFixup(lowered, 'GAME', 12);
  });

  it('rejects runtime register indexes in layout-cast address expressions', async () => {
    const result = await compileAsmFromLines([
      ...spriteType,
      ...spriteBase,
      'main:',
      '  ld hl,<Sprite[16]>SPRITES[HL].flags',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(
          /runtime|compile-time constant|not supported in .asm source/i,
        ),
      }),
    );
  });

  it('rejects register-base layout casts in .asm source', async () => {
    const result = await compileAsmFromLines([
      ...spriteType,
      'main:',
      '  ld hl,<Sprite[16]>HL[2].flags',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(
          /unsupported|ld expects a supported register\/memory\/immediate transfer form/i,
        ),
      }),
    );
  });

  it('rejects unresolved layout-path syntax in .asm source', async () => {
    const result = await compileAsmFromLines([
      ...spriteType,
      ...spriteBase,
      'main:',
      '  ld hl,SPRITES[2].flags',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/does not accept unresolved layout operands/i),
      }),
    );
  });

  it('does not synthesize stores through layout-cast destinations', async () => {
    const result = await compileAsmFromLines([
      ...spriteType,
      ...spriteBase,
      'main:',
      '  ld (<Sprite[16]>SPRITES[3].flags),1',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/unsupported|memory-to-memory|ld expects a supported/i),
      }),
    );
  });

  it('does not synthesize memory-to-memory copies from layout constants', async () => {
    const result = await compileAsmFromLines([
      ...spriteType,
      ...spriteBase,
      'OTHER .equ $2100',
      '',
      'main:',
      '  ld (<Sprite[16]>SPRITES[3].flags),(<Sprite[16]>OTHER[0].flags)',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/unsupported|memory-to-memory|ld expects a supported/i),
      }),
    );
  });
});
