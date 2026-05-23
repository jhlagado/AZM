import { describe, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import {
  compileBackendFixtureDiagnostics,
  expectDiagnostic,
  expectNoDiagnostic,
} from './isaDiagnosticTestHelpers.js';

const PR240_FIXTURE = 'pr240_isa_register_target_diag_matrix_invalid.asm';

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
      id: DiagnosticIds.EncodeError,
      message: 'jr does not support register targets; expects disp8',
    },
    {
      label: 'jr cc disp reg',
      id: DiagnosticIds.EncodeError,
      message: 'jr cc, disp does not support register targets; expects disp8',
    },
    {
      label: 'djnz disp8',
      id: DiagnosticIds.EncodeError,
      message: 'djnz does not support register targets; expects disp8',
    },
  ] satisfies Row[])(
    '$label — explicit diagnostics for register-target misuse in call/jp/jr/djnz',
    async (row) => {
      const diagnostics = await compileBackendFixtureDiagnostics(PR240_FIXTURE);
      expectDiagnostic(diagnostics, {
        id: row.id,
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not emit looser imm/disp placeholder diagnostics for the register-target matrix fixture', async () => {
    const diagnostics = await compileBackendFixtureDiagnostics(PR240_FIXTURE);
    expectNoDiagnostic(diagnostics, {
      message: 'call expects imm16',
    });
    expectNoDiagnostic(diagnostics, {
      message: 'jp expects imm16',
    });
    expectNoDiagnostic(diagnostics, {
      message: 'jr expects disp8',
    });
    expectNoDiagnostic(diagnostics, {
      message: 'djnz expects disp8',
    });
    expectNoDiagnostic(diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
