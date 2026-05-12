import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compilePlacedProgram, formatLoweredInstructions } from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loweredText = async (fixture: string): Promise<string> => {
  const res = await compilePlacedProgram(join(__dirname, 'fixtures', fixture));
  expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return formatLoweredInstructions(res.program).join('\n');
};

describe('PR407 word addressing regressions', () => {
  it('uses EAW + word templates for reg8 and HL indexes', async () => {
    const text = await loweredText('pr407_word_regression.zax');

    // reg8 index path
    expect(text).toMatch(/ld h, \$0+/i); // zero-extend idx8
    expect(text).toMatch(/ld l, e/i); // idx8 lowered via E
    expect(text).toMatch(/add hl, hl/i);
    expect(text).toMatch(/add hl, de/i);
    expect(text).toMatch(/ld e, \(hl\)/i);
    expect(text).toMatch(/ld d, \(hl\)/i);
    expect(text).toMatch(/ld \(hl\), e/i);
    expect(text).toMatch(/ld \(hl\), d/i);

    // Exact HL-indexed word load shape (doc: add hl,hl; ld de,base; add hl,de; ld e,(hl); inc hl; ld d,(hl))
    expect(text).toMatch(
      /add hl, hl[\s\S]*?add hl, de[\s\S]*?ld e, \(hl\)[\s\S]*?inc hl[\s\S]*?ld d, \(hl\)/i,
    );

    // No bogus ld hl,hl noise
    expect(text).not.toMatch(/ld hl, hl/i);

    // reg16 HL index
    expect(text).toMatch(/add hl, hl/i);
    expect(text).toMatch(/add hl, de/i);
    expect(text).toMatch(/ld e, \(hl\)/i);
    expect(text).toMatch(/ld d, \(hl\)/i);
    expect(text).toMatch(/ld \(hl\), e/i);
    expect(text).toMatch(/ld \(hl\), d/i);
  });
});
