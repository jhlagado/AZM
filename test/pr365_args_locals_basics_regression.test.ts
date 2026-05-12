import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  compilePlacedProgram,
  formatLoweredInstructions,
  flattenLoweredInstructions,
} from './helpers/lowered_program.js';

describe('PR365: args+locals basics regression guard', () => {
  it('keeps args+locals basics lowering stable', async () => {
    const entry = join(__dirname, 'fixtures', 'pr365_args_locals_basics.zax');
    const placed = await compilePlacedProgram(entry);
    expect(placed.diagnostics).toEqual([]);
    const lines = formatLoweredInstructions(placed.program).map((line) => line.toUpperCase());

    expect(lines).toContain('ADD HL, DE');
    expect(lines).toContain('INC L');

    const instrs = flattenLoweredInstructions(placed.program);
    const callCount = instrs.filter((ins) => ins.head === '@raw' && ins.bytes?.[0] === 0xcd).length;
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
