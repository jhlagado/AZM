import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

describe('PR875 := IX/IY integration', () => {
  it('lowers accepted IX/IY assignment forms end-to-end', async () => {
    const entry = join(__dirname, 'fixtures', 'pr875_assignment_ixiy.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const instrs = flattenLoweredInstructions(res.program);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(hasRawOpcode(instrs, 0xdd, 0x2a)).toBe(true); // LD IX, (nn)
    expect(hasRawOpcode(instrs, 0x21)).toBe(true); // LD HL, nn
    expect(text).toContain('IY');
  });
});
