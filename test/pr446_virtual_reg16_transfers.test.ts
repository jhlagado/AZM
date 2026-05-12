import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  isReg,
} from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR446: virtual 16-bit transfer patterns', () => {
  it('lowers BC/DE/HL pair transfers with direct byte moves only', async () => {
    const entry = join(__dirname, 'fixtures', 'pr446_virtual_reg16_transfers.zax');
    const res = await compilePlacedProgram(entry);

    expect(res.diagnostics).toEqual([]);

    const instrs = flattenLoweredInstructions(res.program);
    const hasLd = (dst: string, src: string) =>
      instrs.some(
        (ins) => ins.head === 'ld' && isReg(ins.operands[0], dst) && isReg(ins.operands[1], src),
      );

    expect(hasLd('B', 'D')).toBe(true);
    expect(hasLd('C', 'E')).toBe(true);
    expect(hasLd('D', 'B')).toBe(true);
    expect(hasLd('E', 'C')).toBe(true);
    expect(hasLd('B', 'H')).toBe(true);
    expect(hasLd('C', 'L')).toBe(true);
    expect(hasLd('H', 'B')).toBe(true);
    expect(hasLd('L', 'C')).toBe(true);
    expect(hasLd('D', 'H')).toBe(true);
    expect(hasLd('E', 'L')).toBe(true);
    expect(hasLd('H', 'D')).toBe(true);
    expect(hasLd('L', 'E')).toBe(true);
    expect(instrs.some((ins) => ins.head === 'push')).toBe(false);
    expect(instrs.some((ins) => ins.head === 'pop')).toBe(false);
    expect(
      instrs.some(
        (ins) => ins.head === 'ex' && isReg(ins.operands[0], 'DE') && isReg(ins.operands[1], 'HL'),
      ),
    ).toBe(false);
  });
});
