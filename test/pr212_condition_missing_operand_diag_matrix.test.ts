import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR212_FIXTURE = join(
  __dirname,
  'fixtures',
  'pr212_condition_missing_operand_diag_matrix_invalid.zax',
);

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR212: condition missing-operand diagnostics parity', () => {
  it.each([
    {
      label: 'jp cc nn',
      id: DiagnosticIds.EmitError,
      message: 'jp cc, nn expects two operands (cc, nn)',
    },
    {
      label: 'call cc nn',
      id: DiagnosticIds.EmitError,
      message: 'call cc, nn expects two operands (cc, nn)',
    },
    {
      label: 'jr cc disp',
      id: DiagnosticIds.EmitError,
      message: 'jr cc, disp expects two operands (cc, disp8)',
    },
  ] satisfies Row[])('$label — explicit diagnostics when conditional jp/call/jr omit displacement/target', async (row) => {
    const res = await compile(PR212_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not substitute bare imm/disp placeholder diagnostics for the missing-operand matrix fixture', async () => {
    const res = await compile(PR212_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { message: 'jp expects imm16' });
    expectNoDiagnostic(res.diagnostics, { message: 'call expects imm16' });
    expectNoDiagnostic(res.diagnostics, { message: 'jr expects disp8' });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
