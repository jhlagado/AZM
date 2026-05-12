import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR144_FIXTURE = join(__dirname, '..', 'fixtures', 'pr144_isa_ed_cb_diag_matrix_invalid.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR144: ED/CB diagnostics parity matrix', () => {
  it.each([
    { label: 'im', id: DiagnosticIds.EncodeError, message: 'im expects 0, 1, or 2' },
    {
      label: 'in a,(n) dest',
      id: DiagnosticIds.EncodeError,
      message: 'in a,(n) immediate port form requires destination A',
    },
    {
      label: 'in a,(n) imm',
      id: DiagnosticIds.EncodeError,
      message: 'in a,(n) expects an imm8 port number',
    },
    {
      label: 'in reg8',
      id: DiagnosticIds.EncodeError,
      message: 'in expects a reg8 destination',
    },
    {
      label: 'out (c), n',
      id: DiagnosticIds.EncodeError,
      message: 'out (c), n immediate form supports n=0 only',
    },
    {
      label: 'out (n),a src',
      id: DiagnosticIds.EncodeError,
      message: 'out (n),a immediate port form requires source A',
    },
    {
      label: 'out (n),a imm',
      id: DiagnosticIds.EncodeError,
      message: 'out (n),a expects an imm8 port number',
    },
    {
      label: 'adc HL',
      id: DiagnosticIds.EncodeError,
      message: 'adc HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'sbc HL',
      id: DiagnosticIds.EncodeError,
      message: 'sbc HL, rr expects BC/DE/HL/SP',
    },
    {
      label: 'bit index',
      id: DiagnosticIds.EncodeError,
      message: 'bit expects bit index 0..7',
    },
    {
      label: 'res indexed src',
      id: DiagnosticIds.EncodeError,
      message: 'res b,(ix/iy+disp),r requires an indexed memory source',
    },
    {
      label: 'set disp',
      id: DiagnosticIds.EncodeError,
      message: 'set (ix/iy+disp) expects disp8',
    },
    {
      label: 'rl two-op',
      id: DiagnosticIds.EncodeError,
      message: 'rl two-operand form requires (ix/iy+disp) source',
    },
    {
      label: 'rr disp',
      id: DiagnosticIds.EncodeError,
      message: 'rr (ix/iy+disp) expects disp8',
    },
    {
      label: 'sla indexed dest',
      id: DiagnosticIds.EncodeError,
      message: 'sla indexed destination must use legacy reg8 B/C/D/E/H/L/A',
    },
    {
      label: 'sra reg8 dest',
      id: DiagnosticIds.EncodeError,
      message: 'sra (ix/iy+disp),r expects reg8 destination',
    },
    {
      label: 'rrc disp',
      id: DiagnosticIds.EncodeError,
      message: 'rrc (ix/iy+disp) expects disp8',
    },
  ] satisfies Row[])('$label — explicit diagnostics for malformed ED/CB forms', async (row) => {
    const res = await compile(PR144_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not fall back to generic unsupported-instruction for the ED/CB matrix fixture', async () => {
    const res = await compile(PR144_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
