import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR144_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr144_isa_ed_cb_diag_matrix_invalid.asm', import.meta.url),
);

/**
 * Compile-time matrix ported from historical PR coverage: `backend/pr144_isa_ed_cb_diag_matrix.test.ts`.
 * Fixture `pr144_isa_ed_cb_diag_matrix_invalid.asm` — malformed ED/CB I/O, IM, HL add, and bit/rotate forms.
 */
type Row = {
  label: string;
  message: string;
};

describe('PR144: ED/CB diagnostics parity matrix', () => {
  it.each([
    { label: 'im', message: 'im expects 0, 1, or 2' },
    {
      label: 'in a,(n) dest',
      message: 'in a,(n) immediate port form requires destination A',
    },
    {
      label: 'in a,(n) imm',
      message: 'in a,(n) expects an imm8 port number',
    },
    {
      label: 'in reg8',
      message: 'in expects a reg8 destination',
    },
    {
      label: 'out (c), n',
      message: 'out (c), n immediate form supports n=0 only',
    },
    {
      label: 'out (n),a src',
      message: 'out (n),a immediate port form requires source A',
    },
    {
      label: 'out (n),a imm',
      message: 'out (n),a expects an imm8 port number',
    },
    {
      label: 'adc HL',
      message: 'adc HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'sbc HL',
      message: 'sbc HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'bit index',
      message: 'bit expects bit index 0..7',
    },
    {
      label: 'res indexed src',
      message: 'res b,(ix/iy+disp),r requires an indexed memory source',
    },
    {
      label: 'set disp',
      message: 'set (ix/iy+disp) expects disp8',
    },
    {
      label: 'rl two-op',
      message: 'rl two-operand form requires (ix/iy+disp) source',
    },
    {
      label: 'rr disp',
      message: 'rr (ix/iy+disp) expects disp8',
    },
    {
      label: 'sla indexed dest',
      message: 'sla indexed destination must use plain reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'sra reg8 dest',
      message: 'sra (ix/iy+disp),r expects reg8 destination',
    },
    {
      label: 'rrc disp',
      message: 'rrc (ix/iy+disp) expects disp8',
    },
  ] satisfies Row[])('$label — explicit diagnostics for malformed ED/CB forms', async (row) => {
    const res = await compile(PR144_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: row.message,
    });
  });

  it('does not fall back to generic unsupported-instruction for the ED/CB matrix fixture', async () => {
    const res = await compile(PR144_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
