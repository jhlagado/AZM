import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR240_FIXTURE = join(__dirname, '..', 'fixtures', 'pr240_isa_register_target_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR240: ISA register-target diagnostics parity', () => {
  it.each([
    {
      label: 'call imm16',
      id: DiagnosticIds.EncodeError,
      message: 'call does not support register targets; use imm16',
    },
    {
      label: 'jp parens',
      id: DiagnosticIds.EncodeError,
      message: 'jp indirect form requires parentheses; use (hl), (ix), or (iy)',
    },
    {
      label: 'jp imm16',
      id: DiagnosticIds.EncodeError,
      message: 'jp does not support register targets; use imm16',
    },
    {
      label: 'jr disp8',
      id: DiagnosticIds.EmitError,
      message: 'jr does not support register targets; expects disp8',
    },
    {
      label: 'jr cc disp reg',
      id: DiagnosticIds.EmitError,
      message: 'jr cc, disp does not support register targets; expects disp8',
    },
    {
      label: 'djnz disp8',
      id: DiagnosticIds.EmitError,
      message: 'djnz does not support register targets; expects disp8',
    },
  ] satisfies Row[])('$label — explicit diagnostics for register-target misuse in call/jp/jr/djnz', async (row) => {
    const res = await compile(PR240_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not emit looser imm/disp placeholder diagnostics for the register-target matrix fixture', async () => {
    const res = await compile(PR240_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, {
      message: 'call expects imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'jp expects imm16',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'jr expects disp8',
    });
    expectNoDiagnostic(res.diagnostics, {
      message: 'djnz expects disp8',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
