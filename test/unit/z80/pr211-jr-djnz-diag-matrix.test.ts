import { describe, expect, it } from 'vitest';

import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

/**
 * Parse-level matrix for oracle `legacy-root-azm/test/pr211_jr_djnz_diag_matrix.test.ts`
 * (fixture `pr211_jr_djnz_diag_matrix_invalid.asm`). Integration compile coverage lives in
 * `test/integration/pr211-jr-djnz-diag-matrix.test.ts`.
 */
type Row = {
  label: string;
  source: string;
  message: string;
};

describe('PR211: jr/djnz diagnostics parity matrix (parse)', () => {
  it.each([
    {
      label: 'jr cc invalid condition',
      source: 'jr q, 1',
      message: 'jr cc expects valid condition code NZ/Z/NC/C',
    },
    {
      label: 'jr cc disp register',
      source: 'jr nz, a',
      message: 'jr cc, disp does not support register targets; expects disp8',
    },
    {
      label: 'jr cc disp indirect',
      source: 'jr z, (hl)',
      message: 'jr cc, disp does not support indirect targets',
    },
    {
      label: 'jr indirect',
      source: 'jr (hl)',
      message: 'jr does not support indirect targets; expects disp8',
    },
    {
      label: 'djnz indirect',
      source: 'djnz (hl)',
      message: 'djnz does not support indirect targets; expects disp8',
    },
  ] satisfies Row[])('$label', ({ source, message }) => {
    expect(parseZ80Instruction(source)).toEqual({ error: message });
  });
});
