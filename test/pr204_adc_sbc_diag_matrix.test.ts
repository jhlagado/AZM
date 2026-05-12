import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR204_FIXTURE = join(__dirname, 'fixtures', 'pr204_adc_sbc_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR204: adc/sbc malformed-form diagnostics parity', () => {
  it.each([
    {
      label: 'adc destination',
      id: DiagnosticIds.EncodeError,
      message: 'adc expects destination A or HL',
    },
    {
      label: 'adc HL pair',
      id: DiagnosticIds.EncodeError,
      message: 'adc HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'sbc destination',
      id: DiagnosticIds.EncodeError,
      message: 'sbc expects destination A or HL',
    },
    {
      label: 'sbc HL pair',
      id: DiagnosticIds.EncodeError,
      message: 'sbc HL, rr expects BC/DE/HL/SP',
    },
  ] satisfies Row[])('$label — explicit destination diagnostics for malformed two-operand forms', async (row) => {
    const res = await compile(PR204_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

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
