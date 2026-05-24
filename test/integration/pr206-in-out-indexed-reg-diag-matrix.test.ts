import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR206_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr206_in_out_indexed_reg_diag_matrix_invalid.asm', import.meta.url),
);

type Row = {
  label: string;
  message: string;
};

describe('PR206: in/out indexed-byte-register diagnostics parity', () => {
  it.each([
    {
      label: 'in destination',
      message: 'in destination must use plain reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'out source',
      message: 'out source must use plain reg8 B/C/D/E/H/L/A',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for ED in/out forms using IX*/IY* byte registers',
    async (row) => {
      const res = await compile(PR206_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

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
