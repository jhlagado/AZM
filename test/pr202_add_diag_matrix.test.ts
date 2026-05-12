import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR202_ADD_MATRIX_FIXTURE = join(__dirname, 'fixtures', 'pr202_add_diag_matrix_invalid.zax');

type AddMatrixRow = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR202: add malformed-form diagnostics parity', () => {
  it.each([
    {
      label: 'destination family',
      id: DiagnosticIds.EncodeError,
      message: 'add expects destination A, HL, IX, or IY',
    },
    {
      label: 'HL pair operand',
      id: DiagnosticIds.EncodeError,
      message: 'add HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'IX pair operand',
      id: DiagnosticIds.EncodeError,
      message: 'add IX, rr supports BC/DE/SP and same-index pair only',
    },
    {
      label: 'IY pair operand',
      id: DiagnosticIds.EncodeError,
      message: 'add IY, rr supports BC/DE/SP and same-index pair only',
    },
  ] satisfies AddMatrixRow[])('$label — explicit add diagnostic (no generic known-head fallback)', async (row) => {
    const res = await compile(PR202_ADD_MATRIX_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not emit generic known-head fallback for the add matrix fixture', async () => {
    const res = await compile(PR202_ADD_MATRIX_FIXTURE, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'add has unsupported operand form',
    });
  });
});
