import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR208_FIXTURE = join(
  __dirname,
  'fixtures',
  'pr208_call_indirect_legality_diag_matrix_invalid.zax',
);

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR208: call indirect-form legality diagnostics parity', () => {
  it.each([
    {
      label: 'call indirect',
      id: DiagnosticIds.EncodeError,
      message: 'call does not support indirect targets; use imm16',
    },
    {
      label: 'call cc indirect',
      id: DiagnosticIds.EncodeError,
      message: 'call cc, nn does not support indirect targets',
    },
  ] satisfies Row[])('$label — explicit diagnostics for unsupported indirect call targets', async (row) => {
    const res = await compile(PR208_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not emit looser imm16 placeholder diagnostics for the call indirect matrix fixture', async () => {
    const res = await compile(PR208_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'call expects imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'call cc, nn expects condition + imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
