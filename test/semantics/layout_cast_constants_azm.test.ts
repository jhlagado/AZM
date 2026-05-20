import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CompileResult } from '../../src/pipeline.js';
import { compilePlacedProgram } from '../helpers/lowered_program_compile.js';
import { findRawAbs16Target } from '../helpers/lowered_program_symbols.js';
import type { CompiledLoweredProgram } from '../helpers/lowered_program_types.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-layout-cast-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function compilePlacedFromLines(lines: string[]): Promise<CompiledLoweredProgram> {
  const { entry, cleanup } = writeTempSource('azm', `${lines.join('\n')}\n`);
  try {
    return await compilePlacedProgram(entry);
  } finally {
    cleanup();
  }
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
  'type Sprite',
  '  x: byte',
  '  y: byte',
  '  tile: byte',
  '  flags: byte',
  'end',
  '',
];

const spriteBase = ['const SPRITES = $2000', ''];

describe('AZM layout-cast constant folding', () => {
  it('folds field access after a layout cast into an immediate address', async () => {
    const lowered = await compilePlacedFromLines([
      'type Pos',
      '  x: byte',
      '  y: byte',
      'end',
      '',
      'type Sprite',
      '  tile: byte',
      '  pos: Pos',
      'end',
      '',
      'const PLAYER = $2000',
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
      'const BASE = 2',
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
      'type Pos',
      '  x: byte',
      '  y: byte',
      'end',
      '',
      'type Sprite',
      '  tile: byte',
      '  pos: Pos',
      'end',
      '',
      'type World',
      '  header: word',
      '  sprites: Sprite[8]',
      'end',
      '',
      'const BASE = 2',
      'const GAME = $2000',
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
    const { entry, cleanup } = writeTempSource('azm', [
      ...spriteType,
      ...spriteBase,
      'main:',
      '  ld hl,<Sprite[16]>SPRITES[HL].flags',
      '  ret',
      '',
    ].join('\n'));
    try {
      const { compile } = await import('../../src/compile.js');
      const { defaultFormatWriters } = await import('../../src/formats/index.js');
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringMatching(/runtime|compile-time constant|not supported in AZM-native/i),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('rejects register-base layout casts in AZM-native source', async () => {
    const { entry, cleanup } = writeTempSource('azm', [
      ...spriteType,
      'main:',
      '  ld hl,<Sprite[16]>HL[2].flags',
      '  ret',
      '',
    ].join('\n'));
    try {
      const { compile } = await import('../../src/compile.js');
      const { defaultFormatWriters } = await import('../../src/formats/index.js');
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringMatching(/typed effective-address syntax is not supported/i),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('rejects uncast typed-path syntax in AZM-native source', async () => {
    const { entry, cleanup } = writeTempSource('azm', [
      ...spriteType,
      ...spriteBase,
      'main:',
      '  ld hl,SPRITES[2].flags',
      '  ret',
      '',
    ].join('\n'));
    try {
      const { compile } = await import('../../src/compile.js');
      const { defaultFormatWriters } = await import('../../src/formats/index.js');
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringMatching(/typed effective-address syntax is not supported/i),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
