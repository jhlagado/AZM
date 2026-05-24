import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR209_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr209_jp_cc_indirect_legality_diag_matrix_invalid.asm', import.meta.url),
);

type Row = {
  label: string;
  message: string;
};

describe('PR209: jp cc indirect-form legality diagnostics parity', () => {
  it.each([
    {
      label: 'jp cc indirect',
      message: 'jp cc, nn does not support indirect targets',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for unsupported conditional indirect jp targets',
    async (row) => {
      const res = await compile(PR209_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not emit looser condition+imm16 placeholder diagnostics for the jp cc indirect matrix fixture', async () => {
    const res = await compile(PR209_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'jp cc, nn expects condition + imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
