import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR206_FIXTURE = join(__dirname, 'fixtures', 'pr206_in_out_indexed_reg_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR206: in/out indexed-byte-register diagnostics parity', () => {
  it.each([
    {
      label: 'in destination',
      id: DiagnosticIds.EncodeError,
      message: 'in destination must use legacy reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'out source',
      id: DiagnosticIds.EncodeError,
      message: 'out source must use legacy reg8 B/C/D/E/H/L/A',
    },
  ] satisfies Row[])('$label — explicit diagnostics for ED in/out forms using IX*/IY* byte registers', async (row) => {
    const res = await compile(PR206_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not fall back to generic reg8 in/out diagnostics for the indexed-reg matrix fixture', async () => {
    const res = await compile(PR206_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'in expects a reg8 destination',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'out expects a reg8 source',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
