import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR149_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr149_condition_diag_matrix_invalid.asm', import.meta.url),
);

/**
 * Compile-time matrix ported from historical PR coverage: `pr149_condition_diag_matrix.test.ts`.
 * Fixture `pr149_condition_diag_matrix_invalid.asm` — condition operand/form diagnostics for control flow.
 */
type Row = {
  label: string;
  message: string;
};

describe('PR149: condition diagnostics parity matrix', () => {
  it.each([
    {
      label: 'ret condition',
      message: 'ret cc expects a valid condition code',
    },
    {
      label: 'ret arity',
      message: 'ret expects no operands or one condition code',
    },
    {
      label: 'jp cc',
      message: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'jp form',
      message: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
    },
    {
      label: 'call cc',
      message: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'call form',
      message: 'call expects one operand (nn) or two operands (cc, nn)',
    },
    {
      label: 'jr cc',
      message: 'jr cc expects valid condition code NZ/Z/NC/C',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for malformed condition operands/forms',
    async (row) => {
      const res = await compile(PR149_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not report generic unresolved/unsupported fallbacks for the condition matrix fixture', async () => {
    const res = await compile(PR149_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unresolved symbol' });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
