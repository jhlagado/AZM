import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  findRawAbs16Target,
  hasOperands,
  instructionsInLabelRange,
  isImmLiteral,
  isReg,
} from './helpers/lowered_program.js';

describe('PR405: byte call scalar arg', () => {
  it('pushes a bare global byte argument through the scalar byte path', async () => {
    const entry = join(__dirname, 'fixtures', 'pr405_byte_call_scalar_arg.zax');
    const lowered = await compilePlacedProgram(entry);
    expect(lowered.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const mainInstrs = instructionsInLabelRange(lowered, 'main');

    expect(
      findRawAbs16Target(lowered, {
        opcode: 0x3a,
        target: 'glob_b',
        range: { startLabel: 'main' },
      }),
    ).toBeDefined();
    expect(mainInstrs.some((ins) => ins.head === 'ld' && hasOperands(ins, (op) => isReg(op, 'H'), (op) => isImmLiteral(op, 0)))).toBe(true);
    expect(mainInstrs.some((ins) => ins.head === 'ld' && hasOperands(ins, (op) => isReg(op, 'L'), (op) => isReg(op, 'A')))).toBe(true);
    expect(mainInstrs.some((ins) => ins.head === 'push' && hasOperands(ins, (op) => isReg(op, 'HL')))).toBe(true);
    expect(
      findRawAbs16Target(lowered, {
        opcode: 0xcd,
        target: 'sink',
        range: { startLabel: 'main' },
      }),
    ).toBeDefined();
    expect(mainInstrs.some((ins) => ins.head === 'add' && hasOperands(ins, (op) => isReg(op, 'HL'), (op) => isReg(op, 'DE')))).toBe(false);
  });
});
