import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  hasRawOpcode,
  isImmSymbol,
  isMemName,
  isReg,
} from './helpers/lowered_program.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

describe('PR406: word edge cases', () => {
  it('rejects non-scalar storage names in word index position', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_invalid_nonscalar_index_name.zax');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    expectDiagnostic(res.diagnostics, { severity: 'error' });
  });

  it('rejects byte-typed storage in word scalar load/store paths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_invalid_scalar_widths.zax');
    const res = await compile(
      entry,
      { emitAsm80: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('does not partially emit the scalar word fast path when only the source is scalar-fast-path eligible', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_mem_to_mem_partial_fast_path.zax');
    const res = await compilePlacedProgram(entry);
    expectNoErrors(res.diagnostics);
    const instrs = flattenLoweredInstructions(res.program);

    const hasAddHlHl = instrs.some(
      (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'HL'),
    );
    const hasAddHlDe = instrs.some(
      (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'DE'),
    );
    const hasStoreLow = instrs.some(
      (ins) => ins.head === 'ld' && isMemName(ins.operands[0], 'HL') && isReg(ins.operands[1], 'E'),
    );
    const hasStoreHigh = instrs.some(
      (ins) => ins.head === 'ld' && isMemName(ins.operands[0], 'HL') && isReg(ins.operands[1], 'D'),
    );

    const hasLdEE = instrs.some(
      (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isReg(ins.operands[1], 'E'),
    );
    const hasLdDD = instrs.some(
      (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isReg(ins.operands[1], 'D'),
    );
    const hasLdHlSrc = instrs.some(
      (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'HL') && isImmSymbol(ins.operands[1], 'SRC_W'),
    );
    const hasRawLoadDe = hasRawOpcode(instrs, 0xed, 0x5b);

    expect(hasAddHlHl).toBe(true);
    expect(hasAddHlDe).toBe(true);
    expect(hasStoreLow).toBe(true);
    expect(hasStoreHigh).toBe(true);
    expect(hasRawLoadDe).toBe(true);
    expect(hasLdEE).toBe(false);
    expect(hasLdDD).toBe(false);
    expect(hasLdHlSrc).toBe(false);
  });

  it('uses the indexed load template plus scalar store when only the destination is scalar-fast-path eligible', async () => {
    const entry = join(__dirname, 'fixtures', 'pr406_word_mem_to_mem_mixed_reverse.zax');
    const res = await compilePlacedProgram(entry);
    expectNoErrors(res.diagnostics);
    const instrs = flattenLoweredInstructions(res.program);

    const hasPushHl = instrs.some((ins) => ins.head === 'push' && isReg(ins.operands[0], 'HL'));
    const hasAddHlHl = instrs.some(
      (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'HL'),
    );
    const hasAddHlDe = instrs.some(
      (ins) => ins.head === 'add' && isReg(ins.operands[0], 'HL') && isReg(ins.operands[1], 'DE'),
    );
    const hasLoadLow = instrs.some(
      (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'E') && isMemName(ins.operands[1], 'HL'),
    );
    const hasLoadHigh = instrs.some(
      (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'D') && isMemName(ins.operands[1], 'HL'),
    );
    const hasRawStore = hasRawOpcode(instrs, 0xed, 0x53);
    const hasPopHl = instrs.some((ins) => ins.head === 'pop' && isReg(ins.operands[0], 'HL'));
    const hasStoreDst = instrs.some(
      (ins) => ins.head === 'ld' && isMemName(ins.operands[0], 'DST_W') && isReg(ins.operands[1], 'DE'),
    );
    const hasLdHlDst = instrs.some(
      (ins) => ins.head === 'ld' && isReg(ins.operands[0], 'HL') && isImmSymbol(ins.operands[1], 'DST_W'),
    );

    expect(hasPushHl).toBe(true);
    expect(hasAddHlHl).toBe(true);
    expect(hasAddHlDe).toBe(true);
    expect(hasLoadLow).toBe(true);
    expect(hasLoadHigh).toBe(true);
    expect(hasPopHl).toBe(true);
    expect(hasRawStore || hasStoreDst).toBe(true);
    expect(hasLdHlDst).toBe(false);
  });
});
