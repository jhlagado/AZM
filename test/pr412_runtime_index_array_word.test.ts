import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR412 runtime array indexing (word)', () => {
  it('scales word index and uses EAW path', async () => {
    const entry = join(__dirname, 'fixtures', 'pr412_runtime_index_word.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = formatLoweredInstructions(res.program).join('\n');

    // Expect index scaling and base+offset addition:
    expect(text).toMatch(/add hl, hl/i); // scale idx
    expect(text).toMatch(/add hl, de/i); // combine base + scaled idx
    // Word load via HL address (any register shuffle is fine)
    expect(text).toMatch(/ld e, \(hl\)[\s\S]*ld d, \(hl\)/i);
  });
});
