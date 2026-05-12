import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

describe('PR863 := byte storage widening integration', () => {
  it('widens byte storage into register pairs under :=', async () => {
    const entry = join(__dirname, 'fixtures', 'pr863_assignment_byte_widening.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(text).toContain('LD H, $00');
    expect(text).toContain('LD L, A');
    expect(text).toContain('LD D, $00');
    expect(text).toContain('LD E, A');
    expect(text).not.toContain('WORD REGISTER LOAD REQUIRES A WORD-TYPED SOURCE');
  });
});
