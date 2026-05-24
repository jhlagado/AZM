import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

// Supersedes oracle `legacy-root-azm/test/pr203_ld_diag_matrix.test.ts`.
import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR203_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr203_ld_diag_matrix_invalid.asm', import.meta.url),
);

type Row = {
  label: string;
  message: string;
  code: 'AZMN_PARSE';
};

describe('PR203: ld diagnostics parity matrix', () => {
  it.each([
    {
      label: 'mem-mem',
      code: 'AZMN_PARSE',
      message: 'ld does not support memory-to-memory transfers',
    },
    {
      label: 'r8 bc/de load',
      code: 'AZMN_PARSE',
      message: 'ld r8, (bc/de) supports destination A only',
    },
    {
      label: 'bc/de r8 store',
      code: 'AZMN_PARSE',
      message: 'ld (bc/de), r8 supports source A only',
    },
    {
      label: 'AF',
      code: 'AZMN_PARSE',
      message: 'ld does not support AF in this form',
    },
    {
      label: 'rr rr',
      code: 'AZMN_PARSE',
      message: 'ld rr, rr supports SP <- HL/IX/IY only',
    },
  ] satisfies Row[])(
    '$label — explicit ld diagnostics (no fallback/unresolved-fixup noise)',
    async (row) => {
      const res = await compile(PR203_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        code: row.code,
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not emit generic ld fallback or spurious bc/de fixup diagnostics', async () => {
    const res = await compile(PR203_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'ld has unsupported operand form',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'Unresolved symbol "bc" in 16-bit fixup.',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'Unresolved symbol "de" in 16-bit fixup.',
    });
  });
});
