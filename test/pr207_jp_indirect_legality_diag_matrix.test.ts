import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR207_FIXTURE = join(__dirname, 'fixtures', 'pr207_jp_indirect_legality_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR207: jp indirect-form legality diagnostics parity', () => {
  it.each([
    {
      label: 'jp indirect',
      id: DiagnosticIds.EncodeError,
      message: 'jp indirect form supports (hl), (ix), or (iy) only',
    },
  ] satisfies Row[])('$label — explicit diagnostics for unsupported indirect jp addressing forms', async (row) => {
    const res = await compile(PR207_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not emit looser imm16 placeholder diagnostics for the jp indirect matrix fixture', async () => {
    const res = await compile(PR207_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'jp expects imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
