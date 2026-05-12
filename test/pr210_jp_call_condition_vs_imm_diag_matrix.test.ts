import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR210_FIXTURE = join(
  __dirname,
  'fixtures',
  'pr210_jp_call_condition_vs_imm_diag_matrix_invalid.zax',
);

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR210: conditional jp/call condition-vs-imm diagnostics parity', () => {
  it.each([
    {
      label: 'jp cc',
      id: DiagnosticIds.EncodeError,
      message: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'jp cc imm',
      id: DiagnosticIds.EncodeError,
      message: 'jp cc, nn expects imm16',
    },
    {
      label: 'call cc',
      id: DiagnosticIds.EncodeError,
      message: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'call cc imm',
      id: DiagnosticIds.EncodeError,
      message: 'call cc, nn expects imm16',
    },
  ] satisfies Row[])('$label — distinct diagnostics for invalid condition code vs invalid imm16', async (row) => {
    const res = await compile(PR210_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not collapse condition vs imm failures into a single placeholder diagnostic', async () => {
    const res = await compile(PR210_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'jp cc, nn expects condition + imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'call cc, nn expects condition + imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
