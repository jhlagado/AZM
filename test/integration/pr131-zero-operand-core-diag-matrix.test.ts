import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const PR131_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr131_isa_zero_operand_core_invalid.asm', import.meta.url),
);

type Row = { label: string; message: string };

describe('PR131: core zero-operand diagnostics parity', () => {
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
  ] satisfies Row[])('$label — explicit no-operand diagnostic', async (row) => {
    const res = await compile(PR131_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: row.message,
    });
  });
});
