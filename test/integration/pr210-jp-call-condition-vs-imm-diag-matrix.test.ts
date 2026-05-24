import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR210_FIXTURE = fileURLToPath(
  new URL(
    '../fixtures/pr210_jp_call_condition_vs_imm_diag_matrix_invalid.asm',
    import.meta.url,
  ),
);

type Row = {
  label: string;
  message: string;
};

describe('PR210: conditional jp/call condition-vs-imm diagnostics parity', () => {
  it.each([
    {
      label: 'jp cc',
      message: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'jp cc imm',
      message: 'jp cc, nn expects imm16',
    },
    {
      label: 'call cc',
      message: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    },
    {
      label: 'call cc imm',
      message: 'call cc, nn expects imm16',
    },
  ] satisfies Row[])(
    '$label — distinct diagnostics for invalid condition code vs invalid imm16',
    async (row) => {
      const res = await compile(PR210_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

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
