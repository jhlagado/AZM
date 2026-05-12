import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstruction,
  isMemIxDisp,
  isReg,
  operandUsesIx,
} from './helpers/lowered_program.js';

describe('PR405: byte scalar fast paths', () => {
  it('uses a DE shuttle for frame-byte H/L loads and stores without IX H/L lanes', async () => {
    const entry = join(__dirname, 'fixtures', 'pr405_byte_scalar_fast_paths.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const instrs = flattenLoweredInstructions(res.program);
    const formatted = instrs.map(formatLoweredInstruction);

    const hasIxHOrL = instrs.some((ins) => {
      if (ins.head.toLowerCase() !== 'ld') return false;
      const [a, b] = ins.operands;
      if (!a || !b) return false;
      const aIsHL = isReg(a, 'H') || isReg(a, 'L');
      const bIsHL = isReg(b, 'H') || isReg(b, 'L');
      return (aIsHL && operandUsesIx(b)) || (bIsHL && operandUsesIx(a));
    });
    expect(hasIxHOrL).toBe(false);

    const exDeHlCount = instrs.filter(
      (ins) =>
        ins.head.toLowerCase() === 'ex' &&
        ins.operands.length === 2 &&
        isReg(ins.operands[0]!, 'DE') &&
        isReg(ins.operands[1]!, 'HL'),
    ).length;
    expect(exDeHlCount).toBeGreaterThanOrEqual(4);

    const hasLoadE = instrs.some(
      (ins) =>
        ins.head.toLowerCase() === 'ld' &&
        ins.operands.length === 2 &&
        isReg(ins.operands[0]!, 'E') &&
        isMemIxDisp(ins.operands[1]!, -2),
    );
    const hasStoreE = instrs.some(
      (ins) =>
        ins.head.toLowerCase() === 'ld' &&
        ins.operands.length === 2 &&
        isMemIxDisp(ins.operands[0]!, -2) &&
        isReg(ins.operands[1]!, 'E'),
    );
    expect(hasLoadE).toBe(true);
    expect(hasStoreE).toBe(true);

    expect(formatted).not.toContain('LD H, E');
    expect(formatted).not.toContain('LD L, E');
    expect(formatted).not.toContain('LD E, H');
    expect(formatted).not.toContain('LD E, L');
  });
});
