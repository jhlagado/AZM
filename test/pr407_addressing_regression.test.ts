import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compilePlacedProgram,
  formatLoweredInstructions,
  flattenLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR407 addressing model regressions (word load/store)', () => {
  it('uses scaled EAW for word load and template store to global', async () => {
    const entry = join(__dirname, 'fixtures', 'pr407_word_load_store.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = formatLoweredInstructions(res.program).join('\n');
    const instrs = flattenLoweredInstructions(res.program);

    // Runtime word index should scale by 2 and add base.
    expect(text).toMatch(/add hl, hl/i);
    expect(text).toMatch(/add hl, de/i);

    // Store to tmp should go through the word store path.
    expect(hasRawOpcode(instrs, 0x22)).toBe(true);
  });
});
