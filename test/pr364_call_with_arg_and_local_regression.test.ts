import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  compilePlacedProgram,
  formatLoweredInstructions,
  flattenLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

describe('PR364: baseline arg/local lowering regression guard', () => {
  it('keeps the call-with-arg-and-local lowering stable', async () => {
    const entry = join(__dirname, 'fixtures', 'pr364_call_with_arg_and_local.zax');

    const placed = await compilePlacedProgram(entry);
    expect(placed.diagnostics).toEqual([]);
    const lines = formatLoweredInstructions(placed.program).map((line) => line.toUpperCase());

    expect(lines).toContain('INC DE');
    expect(lines).toContain('EX DE, HL');

    const instrs = flattenLoweredInstructions(placed.program);
    expect(hasRawOpcode(instrs, 0xcd)).toBe(true);
  });
});
