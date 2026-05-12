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

describe('PR887 := half-index integration', () => {
  it('lowers accepted half-index assignment forms end-to-end', async () => {
    const entry = join(__dirname, 'fixtures', 'pr887_assignment_half_index.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const instrs = flattenLoweredInstructions(res.program);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(countRawOpcode(instrs, 0x3a)).toBeGreaterThanOrEqual(2); // LD A, (nn)
    expect(text).toContain('LD IXH, A');
    expect(hasRawOpcode(instrs, 0x21)).toBe(true); // LD HL, nn
    expect(text).toContain('ADD HL, DE');
    expect(hasRawOpcode(instrs, 0x7e)).toBe(true); // LD A, (HL)
    expect(text).toContain('LD IXL, A');
    expect(text).toContain('LD A, IXH');
    expect(hasRawOpcode(instrs, 0x32)).toBe(true); // LD (nn), A
    expect(text).toContain('LD IYH, $00');
    expect(countRawOpcode(instrs, 0x3a)).toBeGreaterThanOrEqual(2); // LD A, (nn)
    expect(text).toContain('LD IYL, A');
  });
});
