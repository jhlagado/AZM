import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR208_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr208_call_indirect_legality_diag_matrix_invalid.asm', import.meta.url),
);

type Row = {
  label: string;
  message: string;
};

describe('PR208: call indirect-form legality diagnostics parity', () => {
  it.each([
    {
      label: 'call indirect',
      message: 'call does not support indirect targets; use imm16',
    },
    {
      label: 'call cc indirect',
      message: 'call cc, nn does not support indirect targets',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for unsupported indirect call targets',
    async (row) => {
      const res = await compile(PR208_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

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
