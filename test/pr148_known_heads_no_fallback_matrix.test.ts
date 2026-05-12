import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR148: known-head no-fallback diagnostics matrix', () => {
  it('emits specific diagnostics for malformed known mnemonics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr148_known_heads_no_fallback_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'ret expects no operands or one condition code' });
    expectDiagnostic(res.diagnostics, { message: 'add expects two operands' });
    expectDiagnostic(res.diagnostics, {
      message: 'call expects one operand (nn) or two operands (cc, nn)',
    });
    expectDiagnostic(res.diagnostics, { message: 'call cc, nn expects two operands (cc, nn)' });
    expectDiagnostic(res.diagnostics, {
      message: 'djnz does not support register targets; expects disp8',
    });
    expectDiagnostic(res.diagnostics, { message: 'rst expects an imm8 multiple of 8 (0..56)' });
    expectDiagnostic(res.diagnostics, { message: 'im expects 0, 1, or 2' });
    expectDiagnostic(res.diagnostics, { message: 'in a,(n) expects an imm8 port number' });
    expectDiagnostic(res.diagnostics, {
      message: 'out (n),a immediate port form requires source A',
    });
    expectDiagnostic(res.diagnostics, { message: 'jp cc, nn expects two operands (cc, nn)' });
    expectDiagnostic(res.diagnostics, {
      message: 'jp indirect form supports (hl), (ix), or (iy) only',
    });
    expectDiagnostic(res.diagnostics, { message: 'jr cc, disp expects two operands (cc, disp8)' });
    expectDiagnostic(res.diagnostics, { message: 'jr cc expects valid condition code NZ/Z/NC/C' });
    expectDiagnostic(res.diagnostics, { message: 'ld expects two operands' });
    expectDiagnostic(res.diagnostics, { message: 'inc expects one operand' });
    expectDiagnostic(res.diagnostics, { message: 'dec expects one operand' });
    expectDiagnostic(res.diagnostics, { message: 'push supports BC/DE/HL/AF/IX/IY only' });
    expectDiagnostic(res.diagnostics, { message: 'pop supports BC/DE/HL/AF/IX/IY only' });
    expectDiagnostic(res.diagnostics, { message: 'ex expects two operands' });
    expectDiagnostic(res.diagnostics, { message: 'sub two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'cp two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'and two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'or two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'xor two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'adc expects destination A or HL' });
    expectDiagnostic(res.diagnostics, { message: 'sbc expects destination A or HL' });
    expectDiagnostic(res.diagnostics, { message: 'bit expects bit index 0..7' });
    expectDiagnostic(res.diagnostics, {
      message: 'res b,(ix/iy+disp),r requires an indexed memory source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'set b,(ix/iy+disp),r requires an indexed memory source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'rl two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'rr two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'sla two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'sra two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'srl two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'sll two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'rlc two-operand form requires (ix/iy+disp) source',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'rrc two-operand form requires (ix/iy+disp) source',
    });

    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
