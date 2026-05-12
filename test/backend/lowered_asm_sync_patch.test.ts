import { describe, expect, it } from 'vitest';

import { syncLoweredAsmInstructionBytesFromFinalBytes } from '../../src/lowering/loweredAsmByteEmission.js';
import type { LoweredAsmProgram } from '../../src/lowering/loweredAsmTypes.js';
import type { CompileEnv } from '../../src/semantics/env.js';

const minimalEnv = (): CompileEnv => ({
  consts: new Map(),
  enums: new Map(),
  types: new Map(),
});

describe('syncLoweredAsmInstructionBytesFromFinalBytes', () => {
  it('replaces @raw placeholder bytes with values from the merged image', () => {
    const program: LoweredAsmProgram = {
      blocks: [
        {
          kind: 'section',
          origin: 0x4000,
          section: 'code',
          items: [{ kind: 'instr', head: '@raw', operands: [], bytes: [0x21, 0x00, 0x00] }],
        },
      ],
    };
    const finalBytes = new Map<number, number>([
      [0x4000, 0x21],
      [0x4001, 0x00],
      [0x4002, 0x41],
    ]);
    syncLoweredAsmInstructionBytesFromFinalBytes(program, finalBytes, minimalEnv());
    expect((program.blocks[0]!.items[0] as { bytes?: number[] }).bytes).toEqual([0x21, 0x00, 0x41]);
  });

  it('preserves offset accounting across db items before patched instr', () => {
    const program: LoweredAsmProgram = {
      blocks: [
        {
          kind: 'section',
          origin: 0x4100,
          section: 'data',
          items: [
            { kind: 'db', values: [{ kind: 'literal', value: 1 }] },
            { kind: 'instr', head: '@raw', operands: [], bytes: [0x20, 0x00] },
          ],
        },
      ],
    };
    const finalBytes = new Map<number, number>([
      [0x4100, 1],
      [0x4101, 0x20],
      [0x4102, 0xf9],
    ]);
    syncLoweredAsmInstructionBytesFromFinalBytes(program, finalBytes, minimalEnv());
    expect((program.blocks[0]!.items[1] as { bytes?: number[] }).bytes).toEqual([0x20, 0xf9]);
  });
});
