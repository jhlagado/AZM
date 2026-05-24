import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR225_FIXTURE = fileURLToPath(
  new URL(
    '../fixtures/pr225_indexed_rotate_destination_diag_matrix_invalid.asm',
    import.meta.url,
  ),
);

const HEADS = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'] as const;

type Row = {
  label: string;
  message: string;
};

function rowsForHead(head: (typeof HEADS)[number]): Row[] {
  return [
    {
      label: `${head} plain reg`,
      message: `${head} indexed destination must use plain reg8 B/C/D/E/H/L/A`,
    },
    {
      label: `${head} index family`,
      message: `${head} indexed destination family must match source index base`,
    },
  ];
}

const PR225_ROWS = HEADS.flatMap(rowsForHead);

describe('PR225: indexed rotate/shift destination diagnostics parity matrix', () => {
  it.each(PR225_ROWS)(
    '$label — explicit plain-reg and index-family diagnostics for indexed rotate/shift heads',
    async (row) => {
      const res = await compile(PR225_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
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
