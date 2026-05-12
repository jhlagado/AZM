import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('LOWER-01 typed reinterpretation integration', () => {
  it('lowers scalar load/store, aggregate continuation, and ea-op use through reinterpretation', async () => {
    const entry = join(__dirname, 'fixtures', 'pr770_typed_reinterpretation_positive.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const instrs = flattenLoweredInstructions(res.program);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();
    expect(hasRawOpcode(instrs, 0x7e)).toBe(true);
    expect(text).toContain('LD H, D');
    expect(text).toContain('LD L, E');
    expect(hasRawOpcode(instrs, 0x77)).toBe(true);
    expect(hasRawOpcode(instrs, 0xcd)).toBe(true); // CALL nn
    expect(text).toContain('ADD HL, DE');
  });
});
