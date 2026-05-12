import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { compilePlacedProgram, flattenLoweredInstructions, hasRawOpcode } from './helpers/lowered_program.js';

describe('PR405: byte global scalar symbols', () => {
  it('accepts bare global byte symbols and lowers A loads/stores through direct scalar forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr405_byte_global_scalar_symbols.zax');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const lowered = await compilePlacedProgram(entry);
    expect(lowered.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const instrs = flattenLoweredInstructions(lowered.program);
    expect(hasRawOpcode(instrs, 0x3a)).toBe(true); // LD A,(nn)
    expect(hasRawOpcode(instrs, 0x32)).toBe(true); // LD (nn),A

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(Array.from(bin!.bytes.slice(0, 7))).toEqual([0x3a, 0x00, 0x10, 0x32, 0x00, 0x10, 0xc9]);
  });
});
