import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstruction,
  hasRawOpcode,
} from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR406 word templates (runtime index → BC)', () => {
  it('uses EAW + LW-BC template for reg16 index HL', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_index_bc.zax');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, emitAsm80: true },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toEqual([]);
    const lowered = await compilePlacedProgram(entry);
    expect(lowered.diagnostics).toEqual([]);
    const instrs = flattenLoweredInstructions(lowered.program);
    const lines = instrs.map((ins) => formatLoweredInstruction(ins).toUpperCase());

    expect(lines).toContain('ADD HL, HL');
    expect(hasRawOpcode(instrs, 0x11)).toBe(true); // LD DE,nn
    expect(lines).toContain('ADD HL, DE');
    expect(lines).toContain('LD E, (HL)');
    expect(lines).toContain('LD D, (HL)');
    expect(lines).toContain('LD C, L');
    expect(lines).toContain('LD B, H');
    expect(lines).not.toContain('LD A, (HL)');
  });

  it('uses EAW + SW-BC template for reg16 index HL stores', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_index_bc_store.zax');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, emitAsm80: true },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toEqual([]);
    const lowered = await compilePlacedProgram(entry);
    expect(lowered.diagnostics).toEqual([]);
    const instrs = flattenLoweredInstructions(lowered.program);
    const lines = instrs.map((ins) => formatLoweredInstruction(ins).toUpperCase());

    expect(lines).toContain('ADD HL, HL');
    expect(hasRawOpcode(instrs, 0x11)).toBe(true);
    expect(lines).toContain('ADD HL, DE');
    expect(lines).toContain('LD E, C');
    expect(lines).toContain('LD D, B');
    expect(lines).toContain('LD (HL), E');
    expect(lines).toContain('LD (HL), D');
    expect(lines).not.toContain('LD A, (HL)');
    expect(lines).not.toContain('LD A, C');
  });
});
