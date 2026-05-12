import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

describe('PR412: runtime array indexing matrix', () => {
  it('supports runtime byte indexing via reg8 and reg16', async () => {
    const entry = join(__dirname, 'fixtures', 'pr412_runtime_index_byte_matrix.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(text).toContain('LD H, $00');
    expect(text).toContain('LD L, A');
    expect(text).toContain('ADD HL, DE');
    expect(text).toContain('LD B, (HL)');

    expect(text).toContain('LD HL, $02');
    expect(text).toContain('LD C, (HL)');
  });

  it('keeps runtime word indexing via HL on the scaled EAW path', async () => {
    const entry = join(__dirname, 'fixtures', 'pr412_runtime_index_word.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(text).toContain('ADD HL, HL');
    expect(text).toContain('ADD HL, DE');
    expect(text).toContain('LD E, (HL)');
    expect(text).toContain('LD D, (HL)');
    expect(text).not.toContain('LD A, (HL)');
  });
});
