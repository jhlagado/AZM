import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR205_FIXTURE = join(
  __dirname,
  'fixtures',
  'pr205_indexed_cb_destination_diag_matrix_invalid.zax',
);

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR205: indexed CB destination diagnostics parity', () => {
  it.each([
    {
      label: 'res legacy reg',
      id: DiagnosticIds.EncodeError,
      message: 'res indexed destination must use legacy reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'res index family',
      id: DiagnosticIds.EncodeError,
      message: 'res indexed destination family must match source index base',
    },
    {
      label: 'set legacy reg',
      id: DiagnosticIds.EncodeError,
      message: 'set indexed destination must use legacy reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'set index family',
      id: DiagnosticIds.EncodeError,
      message: 'set indexed destination family must match source index base',
    },
    {
      label: 'rl legacy reg',
      id: DiagnosticIds.EncodeError,
      message: 'rl indexed destination must use legacy reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'rl index family',
      id: DiagnosticIds.EncodeError,
      message: 'rl indexed destination family must match source index base',
    },
    {
      label: 'rrc legacy reg',
      id: DiagnosticIds.EncodeError,
      message: 'rrc indexed destination must use legacy reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'rrc index family',
      id: DiagnosticIds.EncodeError,
      message: 'rrc indexed destination family must match source index base',
    },
  ] satisfies Row[])('$label — explicit indexed destination legality for CB/DD/FD forms', async (row) => {
    const res = await compile(PR205_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not emit looser placeholder reg8-destination diagnostics for the indexed CB matrix fixture', async () => {
    const res = await compile(PR205_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'res b,(ix/iy+disp),r expects reg8 destination',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'set b,(ix/iy+disp),r expects reg8 destination',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'rl (ix/iy+disp),r expects reg8 destination',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'rrc (ix/iy+disp),r expects reg8 destination',
    });
  });
});
