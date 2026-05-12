import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR406 word mem→mem via runtime index', () => {
  it('uses EAW load and store paths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_memmove.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    // Load path: scale idx, base src, load word (any register shuffle acceptable)
    expect(text).toMatch(/add hl, hl/i);
    expect(text).toMatch(/add hl, de/i);
    expect(text).toContain('LD E, (HL)');
    expect(text).toContain('LD D, (HL)');

    // Store path: base dst, store lo/hi bytes
    expect(text).toMatch(/add hl, de/i);
    expect(text).toContain('LD (HL), E');
    expect(text).toContain('LD (HL), D');
  });
});
