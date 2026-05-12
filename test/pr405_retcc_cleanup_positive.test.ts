import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { compilePlacedProgram, flattenLoweredInstructions, hasRawOpcode } from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR405: ret cc cleanup positive coverage', () => {
  it('rewrites conditional returns through a synthetic epilogue when locals require cleanup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr222_locals_multiple_retcc.zax');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics).toEqual([]);

    const lowered = await compilePlacedProgram(entry);
    expect(lowered.diagnostics).toEqual([]);
    const instrs = flattenLoweredInstructions(lowered.program);
    expect(hasRawOpcode(instrs, 0xc2)).toBe(true); // JP NZ
    expect(hasRawOpcode(instrs, 0xca)).toBe(true); // JP Z
  });
});
