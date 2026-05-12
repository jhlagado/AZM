import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compilePlacedProgram, formatLoweredInstructions } from '../helpers/lowered_program.js';

describe('PR1338 follow-up: typed aggregate local as addr call argument', () => {
  it('loads the pointer word from the slot (not the slot address) when passing a bare name', async () => {
    const { program, diagnostics } = await compilePlacedProgram(
      join(__dirname, '..', 'fixtures', 'pr1338_typed_local_addr_arg.zax'),
    );
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const lines = formatLoweredInstructions(program).map((line) => line.toUpperCase());
    expect(lines.some((line) => line.includes('LD E, (IX-$02)') || line.includes('LD E,(IX-$02)'))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes('LD D, (IX-$01)') || line.includes('LD D,(IX-$01)'))).toBe(
      true,
    );
  });
});
