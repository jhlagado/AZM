import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR209_FIXTURE = join(
  __dirname,
  'fixtures',
  'pr209_jp_cc_indirect_legality_diag_matrix_invalid.zax',
);

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR209: jp cc indirect-form legality diagnostics parity', () => {
  it.each([
    {
      label: 'jp cc indirect',
      id: DiagnosticIds.EncodeError,
      message: 'jp cc, nn does not support indirect targets',
    },
  ] satisfies Row[])('$label — explicit diagnostics for unsupported conditional indirect jp targets', async (row) => {
    const res = await compile(PR209_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

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
