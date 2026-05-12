import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

const countRawOpcode = (
  instrs: ReturnType<typeof flattenLoweredInstructions>,
  opcode: number,
): number =>
  instrs.reduce((count, instr) => {
    if (instr.head !== '@raw' || !instr.bytes) return count;
    return instr.bytes[0] === opcode ? count + 1 : count;
  }, 0);

describe('PR869 := reg8 integration', () => {
  it('lowers accepted reg8 storage transfer forms end-to-end', async () => {
    const entry = join(__dirname, 'fixtures', 'pr869_assignment_reg8.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const instrs = flattenLoweredInstructions(res.program);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(countRawOpcode(instrs, 0x3a)).toBeGreaterThanOrEqual(2); // LD A, (nn)
    expect(text).toContain('LD B, A');
    expect(text).toContain('LD L, A');
    expect(text).toContain('LD H, $00');
    expect(hasRawOpcode(instrs, 0x21)).toBe(true); // LD HL, nn
    expect(text).toContain('ADD HL, DE');
    expect(hasRawOpcode(instrs, 0x46)).toBe(true); // LD B, (HL)
    expect(text).toContain('LD A, B');
    expect(hasRawOpcode(instrs, 0x32)).toBe(true); // LD (nn), A
  });
});
