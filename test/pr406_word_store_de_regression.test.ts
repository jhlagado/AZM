import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR406 word store (runtime index, DE)', () => {
  it('scales index and stores both bytes from DE', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_store_de.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = formatLoweredInstructions(res.program).join('\n').toUpperCase();

    expect(text).toMatch(/add hl, hl/i); // scale idx
    expect(text).toMatch(/add hl, de/i); // combine
    expect(text).toContain('LD (HL), E'); // store low
    expect(text).toContain('LD (HL), D'); // store high
  });
});
