import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR207_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr207_jp_indirect_legality_diag_matrix_invalid.asm', import.meta.url),
);

type Row = {
  label: string;
  message: string;
};

describe('PR207: jp indirect-form legality diagnostics parity', () => {
  it.each([
    {
      label: 'jp indirect',
      message: 'jp indirect form supports (hl), (ix), or (iy) only',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for unsupported indirect jp addressing forms',
    async (row) => {
      const res = await compile(PR207_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

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
