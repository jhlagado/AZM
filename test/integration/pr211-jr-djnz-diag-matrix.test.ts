import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR211_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr211_jr_djnz_diag_matrix_invalid.asm', import.meta.url),
);

/**
 * Compile-time matrix ported from historical PR coverage: `pr211_jr_djnz_diag_matrix.test.ts`.
 * Fixture `pr211_jr_djnz_diag_matrix_invalid.asm` — JR/DJNZ invalid condition, register, and indirect forms.
 */
type Row = {
  label: string;
  message: string;
  code: 'AZMN_PARSE';
};

describe('PR211: jr/djnz malformed-form diagnostics parity', () => {
  it.each([
    {
      label: 'jr cc',
      code: 'AZMN_PARSE',
      message: 'jr cc expects valid condition code NZ/Z/NC/C',
    },
    {
      label: 'jr cc disp reg',
      code: 'AZMN_PARSE',
      message: 'jr cc, disp does not support register targets; expects disp8',
    },
    {
      label: 'jr cc disp indirect',
      code: 'AZMN_PARSE',
      message: 'jr cc, disp does not support indirect targets',
    },
    {
      label: 'jr indirect',
      code: 'AZMN_PARSE',
      message: 'jr does not support indirect targets; expects disp8',
    },
    {
      label: 'djnz indirect',
      code: 'AZMN_PARSE',
      message: 'djnz does not support indirect targets; expects disp8',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for invalid condition, disp, and indirect forms',
    async (row) => {
      const res = await compile(PR211_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        code: row.code,
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not emit looser jr placeholder diagnostics for the jr/djnz matrix fixture', async () => {
    const res = await compile(PR211_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'jr cc, disp expects NZ/Z/NC/C + disp8',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
