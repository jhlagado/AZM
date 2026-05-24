import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR240_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr240_isa_register_target_diag_matrix_invalid.asm', import.meta.url),
);

type Row = { label: string; message: string };

describe('PR240: ISA register-target diagnostics parity', () => {
  it.each([
    {
      label: 'call imm16',
      message: 'call does not support register targets; use imm16',
    },
    {
      label: 'jp parens',
      message: 'jp indirect form requires parentheses; use (hl), (ix), or (iy)',
    },
    {
      label: 'jp imm16',
      message: 'jp does not support register targets; use imm16',
    },
    {
      label: 'jr disp8',
      message: 'jr does not support register targets; expects disp8',
    },
    {
      label: 'jr cc disp reg',
      message: 'jr cc, disp does not support register targets; expects disp8',
    },
    {
      label: 'djnz disp8',
      message: 'djnz does not support register targets; expects disp8',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for register-target misuse in call/jp/jr/djnz',
    async (row) => {
      const res = await compile(PR240_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

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
