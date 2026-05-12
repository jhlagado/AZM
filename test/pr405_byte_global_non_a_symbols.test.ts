import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstruction,
  hasRawOpcode,
} from './helpers/lowered_program.js';

describe('PR405: byte global non-A scalar symbols', () => {
  it('uses scalar fast paths for non-A global byte accesses', async () => {
    const entry = join(__dirname, 'fixtures', 'pr405_byte_global_non_a_symbols.zax');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const lowered = await compilePlacedProgram(entry);
    expect(lowered.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const instrs = flattenLoweredInstructions(lowered.program);
    const lines = instrs.map((ins) => formatLoweredInstruction(ins).toUpperCase());

    expect(hasRawOpcode(instrs, 0x3a)).toBe(true);
    expect(hasRawOpcode(instrs, 0x32)).toBe(true);
    expect(lines).toContain('LD B, A');
    expect(lines).toContain('LD H, A');
    expect(lines).toContain('LD A, B');
    expect(lines).toContain('LD A, H');
  });
});
