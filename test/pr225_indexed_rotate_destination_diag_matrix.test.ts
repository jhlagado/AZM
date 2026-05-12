import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR225_FIXTURE = join(
  __dirname,
  'fixtures',
  'pr225_indexed_rotate_destination_diag_matrix_invalid.zax',
);

const HEADS = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'] as const;

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

function rowsForHead(head: (typeof HEADS)[number]): Row[] {
  return [
    {
      label: `${head} legacy reg`,
      id: DiagnosticIds.EncodeError,
      message: `${head} indexed destination must use legacy reg8 B/C/D/E/H/L/A`,
    },
    {
      label: `${head} index family`,
      id: DiagnosticIds.EncodeError,
      message: `${head} indexed destination family must match source index base`,
    },
  ];
}

const PR225_ROWS = HEADS.flatMap(rowsForHead);

describe('PR225: indexed rotate/shift destination diagnostics parity matrix', () => {
  it.each(PR225_ROWS)(
    '$label — explicit legacy-reg and index-family diagnostics for indexed rotate/shift heads',
    async (row) => {
      const res = await compile(PR225_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        id: row.id,
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not emit looser reg8-destination placeholder diagnostics for indexed rotate/shift heads', async () => {
    const res = await compile(PR225_FIXTURE, {}, { formats: defaultFormatWriters });
    for (const head of HEADS) {
      expectNoDiagnostic(res.diagnostics, {
        message: `${head} (ix/iy+disp),r expects reg8 destination`,
      });
    }
  });
});
