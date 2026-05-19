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
  const { entry, cleanup } = writeTempSource('zax', `${lines.join('\n')}\n`);
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

const spriteDataSection = [
  'section data sprites at $2000',
  '  SPRITES:',
  '  ds sizeof(Sprite[16])',
  'end',
  '',
];

const codeSectionHeader = ['section code text at $0000', ''];

describe('AZM layout-cast constant folding', () => {
  it('folds a constant array layout cast into an immediate address', async () => {
    const lowered = await compilePlacedFromLines([
      ...spriteType,
      'const BASE = 2',
      '',
      ...spriteDataSection,
      ...codeSectionHeader,
      'export func main()',
      '  ld hl,<Sprite[16]>SPRITES[BASE + 1].flags',
      '  ret',
      'end',
      'end',
    ]);

    expectNoErrorDiagnostics(lowered);
    expectLdHlFixup(lowered, 'SPRITES', 15);
  });

  it('folds a constant layout cast in memory operands', async () => {
    const lowered = await compilePlacedFromLines([
      ...spriteType,
      ...spriteDataSection,
      ...codeSectionHeader,
      'export func main()',
      '  ld a,(<Sprite[16]>SPRITES[3].flags)',
      '  ret',
      'end',
      'end',
    ]);

    expectNoErrorDiagnostics(lowered);
    expectLdAAbsFixup(lowered, 'SPRITES', 15);
  });

  it('rejects runtime register indexes in layout-cast address expressions', async () => {
    const { entry, cleanup } = writeTempSource('zax', [
      ...spriteType,
      ...spriteDataSection,
      ...codeSectionHeader,
      'export func main()',
      '  ld hl,<Sprite[16]>SPRITES[HL].flags',
      '  ret',
      'end',
      'end',
      '',
    ].join('\n'));
    try {
      const { compile } = await import('../../src/compile.js');
      const { defaultFormatWriters } = await import('../../src/formats/index.js');
      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringMatching(/runtime|compile-time constant/i),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
