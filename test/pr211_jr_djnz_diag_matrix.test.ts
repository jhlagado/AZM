import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR211_FIXTURE = join(__dirname, 'fixtures', 'pr211_jr_djnz_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR211: jr/djnz malformed-form diagnostics parity', () => {
  it.each([
    {
      label: 'jr cc',
      id: DiagnosticIds.EmitError,
      message: 'jr cc expects valid condition code NZ/Z/NC/C',
    },
    {
      label: 'jr cc disp reg',
      id: DiagnosticIds.EmitError,
      message: 'jr cc, disp does not support register targets; expects disp8',
    },
    {
      label: 'jr cc disp indirect',
      id: DiagnosticIds.EmitError,
      message: 'jr cc, disp does not support indirect targets',
    },
    {
      label: 'jr indirect',
      id: DiagnosticIds.EmitError,
      message: 'jr does not support indirect targets; expects disp8',
    },
    {
      label: 'djnz indirect',
      id: DiagnosticIds.EmitError,
      message: 'djnz does not support indirect targets; expects disp8',
    },
  ] satisfies Row[])('$label — explicit diagnostics for invalid condition, disp, and indirect forms', async (row) => {
    const res = await compile(PR211_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not emit looser jr placeholder diagnostics for the jr/djnz matrix fixture', async () => {
    const res = await compile(PR211_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'jr cc, disp expects NZ/Z/NC/C + disp8',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
