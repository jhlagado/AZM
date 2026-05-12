import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR203_FIXTURE = join(__dirname, 'fixtures', 'pr203_ld_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR203: ld diagnostics parity matrix', () => {
  it.each([
    {
      label: 'mem-mem',
      id: DiagnosticIds.EncodeError,
      message: 'ld does not support memory-to-memory transfers',
    },
    {
      label: 'r8 bc/de load',
      id: DiagnosticIds.EncodeError,
      message: 'ld r8, (bc/de) supports destination A only',
    },
    {
      label: 'bc/de r8 store',
      id: DiagnosticIds.EncodeError,
      message: 'ld (bc/de), r8 supports source A only',
    },
    {
      label: 'AF',
      id: DiagnosticIds.EncodeError,
      message: 'ld does not support AF in this form',
    },
    {
      label: 'rr rr',
      id: DiagnosticIds.EncodeError,
      message: 'ld rr, rr supports SP <- HL/IX/IY only',
    },
  ] satisfies Row[])('$label — explicit ld diagnostics (no fallback/unresolved-fixup noise)', async (row) => {
    const res = await compile(PR203_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

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
