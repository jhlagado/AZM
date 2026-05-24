import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import {
  expectDiagnostic,
  expectIndexedRotateShiftSourceDiagnostics,
  expectNoDiagnostic,
} from '../helpers/diagnostics/index.js';

const PR148_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr148_known_heads_no_fallback_matrix.asm', import.meta.url),
);

/**
 * Compile-time matrix for oracle `legacy-root-azm/test/pr148_known_heads_no_fallback_matrix.test.ts`.
 * Fixture `pr148_known_heads_no_fallback_matrix.asm` — known mnemonics emit explicit diagnostics, not generic fallback.
 */
describe('PR148: known-head no-fallback diagnostics matrix', () => {
  it('emits specific diagnostics for malformed known mnemonics', async () => {
    const res = await compile(PR148_FIXTURE, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'ret expects no operands or one condition code' });
    expectDiagnostic(res.diagnostics, { message: 'add expects two operands' });
    expectDiagnostic(res.diagnostics, {
      message: 'call expects one operand (nn) or two operands (cc, nn)',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'djnz does not support register targets; expects disp8',
    });
    expectDiagnostic(res.diagnostics, { message: 'rst expects an imm8 multiple of 8 (0..56)' });
    expectDiagnostic(res.diagnostics, { message: 'im expects 0, 1, or 2' });
    expectDiagnostic(res.diagnostics, { message: 'in a,(n) expects an imm8 port number' });
    expectDiagnostic(res.diagnostics, {
      message: 'out (n),a immediate port form requires source A',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'jp indirect form supports (hl), (ix), or (iy) only',
    });
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
    expectIndexedRotateShiftSourceDiagnostics(res.diagnostics);

    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
