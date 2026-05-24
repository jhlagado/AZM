import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR147_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr147_known_head_diag_matrix_invalid.asm', import.meta.url),
);

/**
 * Compile-time matrix for oracle `legacy-root-azm/test/pr147_known_head_diag_matrix.test.ts`.
 * Fixture `pr147_known_head_diag_matrix_invalid.asm` — broad known-head operand/arity diagnostics.
 */
type Row = {
  label: string;
  message: string;
};

describe('PR147: broad known-head diagnostic matrix', () => {
  it.each([
    { label: 'add', message: 'add expects two operands' },
    { label: 'ld', message: 'ld expects two operands' },
    { label: 'inc', message: 'inc expects one operand' },
    { label: 'dec', message: 'dec expects one operand' },
    {
      label: 'push',
      message: 'push supports BC/DE/HL/AF/IX/IY only',
    },
    { label: 'pop', message: 'pop supports BC/DE/HL/AF/IX/IY only' },
    { label: 'ex', message: 'ex expects two operands' },
    {
      label: 'call reg',
      message: 'call does not support register targets; use imm16',
    },
    {
      label: 'call cc imm',
      message: 'call cc, nn expects imm16',
    },
    {
      label: 'jp indirect',
      message: 'jp indirect form supports (hl), (ix), or (iy) only',
    },
    {
      label: 'jr cc',
      message: 'jr cc expects valid condition code NZ/Z/NC/C',
    },
    {
      label: 'djnz',
      message: 'djnz does not support register targets; expects disp8',
    },
    {
      label: 'rst',
      message: 'rst expects an imm8 multiple of 8 (0..56)',
    },
    { label: 'im', message: 'im expects 0, 1, or 2' },
    {
      label: 'in',
      message: 'in a,(n) expects an imm8 port number',
    },
    {
      label: 'out',
      message: 'out (n),a immediate port form requires source A',
    },
  ] satisfies Row[])(
    '$label — specific diagnostics for malformed known instruction heads',
    async (row) => {
      const res = await compile(PR147_FIXTURE, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: row.message,
      });
    },
  );

  it('does not fall back to generic unsupported-instruction for the known-head matrix fixture', async () => {
    const res = await compile(PR147_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
