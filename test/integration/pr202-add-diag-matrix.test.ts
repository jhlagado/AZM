import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR202_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr202_add_diag_matrix_invalid.asm', import.meta.url),
);

type Row = {
  label: string;
  message: string;
};

describe('PR202: add malformed-form diagnostics parity', () => {
  it.each([
    {
      label: 'destination family',
      message: 'add expects destination A, HL, IX, or IY',
    },
    {
      label: 'HL pair operand',
      message: 'add HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'IX pair operand',
      message: 'add IX, rr supports BC/DE/SP and same-index pair only',
    },
    {
      label: 'IY pair operand',
      message: 'add IY, rr supports BC/DE/SP and same-index pair only',
    },
  ] satisfies Row[])(
    '$label — explicit add diagnostic (no generic known-head fallback)',
    async (row) => {
      const res = await compile(PR202_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not emit generic known-head fallback for the add matrix fixture', async () => {
    const res = await compile(PR202_FIXTURE, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'add has unsupported operand form',
    });
  });
});
