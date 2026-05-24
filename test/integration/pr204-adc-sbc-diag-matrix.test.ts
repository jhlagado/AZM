import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR204_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr204_adc_sbc_diag_matrix_invalid.asm', import.meta.url),
);

type Row = {
  label: string;
  message: string;
};

describe('PR204: adc/sbc malformed-form diagnostics parity', () => {
  it.each([
    {
      label: 'adc destination',
      message: 'adc expects destination A or HL',
    },
    {
      label: 'adc HL pair',
      message: 'adc HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'sbc destination',
      message: 'sbc expects destination A or HL',
    },
    {
      label: 'sbc HL pair',
      message: 'sbc HL, rr expects BC/DE/HL/SP',
    },
  ] satisfies Row[])(
    '$label — explicit destination diagnostics for malformed two-operand forms',
    async (row) => {
      const res = await compile(PR204_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not report generic unsupported-operand fallbacks for the adc/sbc matrix fixture', async () => {
    const res = await compile(PR204_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'adc has unsupported operand form',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'sbc has unsupported operand form',
    });
  });
});
