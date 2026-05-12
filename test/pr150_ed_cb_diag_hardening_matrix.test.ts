import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR150: ED/CB diagnostics hardening matrix', () => {
  it('reports explicit diagnostics for malformed ED/CB forms without fallback errors', async () => {
    const entry = join(__dirname, 'fixtures', 'pr150_ed_cb_diag_hardening_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'in expects one or two operands' });
    expectDiagnostic(res.diagnostics, { message: 'in (c) is the only one-operand in form' });
    expectDiagnostic(res.diagnostics, { message: 'in expects a port operand (c) or (imm8)' });
    expectDiagnostic(res.diagnostics, { message: 'in a,(n) expects an imm8 port number' });
    expectDiagnostic(res.diagnostics, {
      message: 'in a,(n) immediate port form requires destination A',
    });
    expectDiagnostic(res.diagnostics, { message: 'out expects two operands' });
    expectDiagnostic(res.diagnostics, { message: 'out expects a reg8 source' });
    expectDiagnostic(res.diagnostics, {
      message: 'out (n),a immediate port form requires source A',
    });
    expectDiagnostic(res.diagnostics, { message: 'out (n),a expects an imm8 port number' });
    expectDiagnostic(res.diagnostics, { message: 'out (c), n immediate form supports n=0 only' });
    expectDiagnostic(res.diagnostics, { message: 'im expects one operand' });
    expectDiagnostic(res.diagnostics, { message: 'im expects 0, 1, or 2' });
    expectDiagnostic(res.diagnostics, { message: 'adc HL, rr expects BC/DE/HL/SP' });
    expectDiagnostic(res.diagnostics, { message: 'sbc HL, rr expects BC/DE/HL/SP' });
    expectDiagnostic(res.diagnostics, { message: 'bit expects two operands' });
    expectDiagnostic(res.diagnostics, { message: 'bit expects bit index 0..7' });
    expectDiagnostic(res.diagnostics, { message: 'bit (ix/iy+disp) expects disp8' });
    expectDiagnostic(res.diagnostics, {
      message: 'res expects two operands, or three with indexed source + reg8 destination',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'res b,(ix/iy+disp),r requires an indexed memory source',
    });
    expectDiagnostic(res.diagnostics, { message: 'res (ix/iy+disp) expects disp8' });
    expectDiagnostic(res.diagnostics, {
      message: 'set expects two operands, or three with indexed source + reg8 destination',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'set b,(ix/iy+disp),r requires an indexed memory source',
    });
    expectDiagnostic(res.diagnostics, { message: 'set (ix/iy+disp) expects disp8' });
    expectDiagnostic(res.diagnostics, {
      message: 'rl expects one operand, or two with indexed source + reg8 destination',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'rl two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'rr two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, { message: 'rlc (ix/iy+disp) expects disp8' });
    expectDiagnostic(res.diagnostics, {
      message: 'sll expects one operand, or two with indexed source + reg8 destination',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'sll two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, { message: 'sra (ix/iy+disp) expects disp8' });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
