import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  compilePlacedProgram,
  formatLoweredInstructions,
  flattenLoweredInstructions,
  hasRawOpcode,
} from '../helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('#509 lowerLdWithEa integration', () => {
  it('still lowers representative byte and word ld shapes through the moved helper', async () => {
    const byteEntry = join(__dirname, '..', 'fixtures', 'pr405_byte_global_non_a_symbols.zax');
    const byteRes = await compilePlacedProgram(byteEntry);
    expect(byteRes.diagnostics).toEqual([]);
    const byteLines = formatLoweredInstructions(byteRes.program).map((line) => line.toUpperCase());
    const byteInstrs = flattenLoweredInstructions(byteRes.program);
    expect(byteLines).toContain('PUSH AF');
    expect(hasRawOpcode(byteInstrs, 0x3a)).toBe(true);
    expect(byteLines).toContain('LD B, A');

    const wordEntry = join(__dirname, '..', 'fixtures', 'pr406_word_mem_to_mem_mixed_reverse.zax');
    const wordRes = await compilePlacedProgram(wordEntry);
    expect(wordRes.diagnostics).toEqual([]);
    const wordLines = formatLoweredInstructions(wordRes.program).map((line) => line.toUpperCase());
    const wordInstrs = flattenLoweredInstructions(wordRes.program);
    expect(wordLines).toContain('LD E, (HL)');
    expect(hasRawOpcode(wordInstrs, 0xed, 0x53)).toBe(true);
  });
});
