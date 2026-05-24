import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR151_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr151_zero_operand_head_diag_matrix.asm', import.meta.url),
);

/**
 * Compile-time matrix for oracle `legacy-root-azm/test/pr151_zero_operand_head_diag_matrix.test.ts`.
 * Fixture `pr151_zero_operand_head_diag_matrix.asm` — zero-operand known heads reject extra operands.
 */
type Row = {
  label: string;
  message: string;
};

describe('PR151: zero-operand known-head diagnostics matrix', () => {
  it.each([
    { label: 'nop', message: 'nop expects no operands' },
    { label: 'halt', message: 'halt expects no operands' },
    { label: 'di', message: 'di expects no operands' },
    { label: 'ei', message: 'ei expects no operands' },
    { label: 'scf', message: 'scf expects no operands' },
    { label: 'ccf', message: 'ccf expects no operands' },
    { label: 'cpl', message: 'cpl expects no operands' },
    { label: 'daa', message: 'daa expects no operands' },
    { label: 'rlca', message: 'rlca expects no operands' },
    { label: 'rrca', message: 'rrca expects no operands' },
    { label: 'rla', message: 'rla expects no operands' },
    { label: 'rra', message: 'rra expects no operands' },
    { label: 'exx', message: 'exx expects no operands' },
    { label: 'neg', message: 'neg expects no operands' },
    { label: 'reti', message: 'reti expects no operands' },
    { label: 'retn', message: 'retn expects no operands' },
    { label: 'rrd', message: 'rrd expects no operands' },
    { label: 'rld', message: 'rld expects no operands' },
    { label: 'ldi', message: 'ldi expects no operands' },
    { label: 'ldir', message: 'ldir expects no operands' },
    { label: 'ldd', message: 'ldd expects no operands' },
    { label: 'lddr', message: 'lddr expects no operands' },
    { label: 'cpi', message: 'cpi expects no operands' },
    { label: 'cpir', message: 'cpir expects no operands' },
    { label: 'cpd', message: 'cpd expects no operands' },
    { label: 'cpdr', message: 'cpdr expects no operands' },
    { label: 'ini', message: 'ini expects no operands' },
    { label: 'inir', message: 'inir expects no operands' },
    { label: 'ind', message: 'ind expects no operands' },
    { label: 'indr', message: 'indr expects no operands' },
    { label: 'outi', message: 'outi expects no operands' },
    { label: 'otir', message: 'otir expects no operands' },
    { label: 'outd', message: 'outd expects no operands' },
    { label: 'otdr', message: 'otdr expects no operands' },
  ] satisfies Row[])('$label — rejects extra operands on zero-operand known heads', async (row) => {
    const res = await compile(PR151_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: row.message,
    });
  });

  it('does not fall back to generic unsupported-instruction for the zero-operand matrix fixture', async () => {
    const res = await compile(PR151_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
