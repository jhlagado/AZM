import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR149_FIXTURE = join(__dirname, 'fixtures', 'pr149_condition_diag_matrix_invalid.asm');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR149: condition diagnostics parity matrix', () => {
  it.each([
    {
      label: 'ret condition',
      id: DiagnosticIds.EncodeError,
      message: 'ret cc expects a valid condition code',
    },
    {
      label: 'ret arity',
      id: DiagnosticIds.EncodeError,
      message: 'ret expects no operands or one condition code',
    },
    {
      label: 'jp cc',
      id: DiagnosticIds.EncodeError,
      message: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'jp form',
      id: DiagnosticIds.EncodeError,
      message: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
    },
    {
      label: 'call cc',
      id: DiagnosticIds.EncodeError,
      message: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'call form',
      id: DiagnosticIds.EncodeError,
      message: 'call expects one operand (nn) or two operands (cc, nn)',
    },
    {
      label: 'jr cc',
      id: DiagnosticIds.EncodeError,
      message: 'jr cc expects valid condition code NZ/Z/NC/C',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for malformed condition operands/forms',
    async (row) => {
      const res = await compile(PR149_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        id: row.id,
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
