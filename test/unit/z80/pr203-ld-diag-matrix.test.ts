import { describe, expect, it } from 'vitest';

import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

/**
 * Parse-level matrix ported from historical PR coverage: `pr203_ld_diag_matrix.test.ts`
 * (fixture `pr203_ld_diag_matrix_invalid.asm`). Integration compile coverage lives in
 * `test/integration/pr203-ld-diag-matrix.test.ts`.
 */
type Row = {
  label: string;
  source: string;
  message: string;
};

describe('PR203: ld diagnostics parity matrix (parse)', () => {
  it.each([
    {
      label: 'mem-mem (bc),(de)',
      source: 'ld (bc),(de)',
      message: 'ld does not support memory-to-memory transfers',
    },
    {
      label: 'mem-mem (ix+1),(iy+2)',
      source: 'ld (ix+1),(iy+2)',
      message: 'ld does not support memory-to-memory transfers',
    },
    {
      label: 'mem-mem (hl),(ix+1)',
      source: 'ld (hl),(ix+1)',
      message: 'ld does not support memory-to-memory transfers',
    },
    {
      label: 'r8 bc/de load',
      source: 'ld b,(bc)',
      message: 'ld r8, (bc/de) supports destination A only',
    },
    {
      label: 'bc/de r8 store',
      source: 'ld (de),c',
      message: 'ld (bc/de), r8 supports source A only',
    },
    {
      label: 'AF pair',
      source: 'ld af,af',
      message: 'ld does not support AF in this form',
    },
    {
      label: 'rr rr ix,iy',
      source: 'ld ix,iy',
      message: 'ld rr, rr supports SP <- HL/IX/IY only',
    },
    {
      label: 'SP with AF',
      source: 'ld sp,af',
      message: 'ld does not support AF in this form',
    },
  ] satisfies Row[])('$label', ({ source, message }) => {
    expect(parseZ80Instruction(source)).toEqual({ error: message });
  });

  it('does not accept unknown mnemonics as ld errors', () => {
    expect(parseZ80Instruction('not_a_real_z80_op 0')).toBeUndefined();
  });
});
