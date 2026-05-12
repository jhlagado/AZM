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

describe('PR405: byte indexed templates', () => {
  it('uses the documented byte templates for runtime-indexed global byte access', async () => {
    const entry = join(__dirname, 'fixtures', 'pr405_byte_indexed_templates.zax');
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

    expect(lines).toContain('PUSH DE');
    expect(lines).toContain('PUSH HL');
    expect(hasRawOpcode(instrs, 0x11)).toBe(true); // LD DE,nn
    expect(lines).toContain('LD H, $00');
    expect(lines).toContain('LD L, C');
    expect(lines).toContain('ADD HL, DE');
    expect(lines).toContain('LD A, (HL)');
    expect(lines).toContain('POP HL');
    expect(lines).toContain('POP DE');

    expect(lines).toContain('LD H, $22');
    expect(lines).toContain('LD (HL), D');
  });
});
