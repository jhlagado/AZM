import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PR151_FIXTURE = join(__dirname, 'fixtures', 'pr151_zero_operand_head_diag_matrix.zax');

type Row = {
  label: string;
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
  message: string;
};

describe('PR151: zero-operand known-head diagnostics matrix', () => {
  it.each([
    { label: 'nop', id: DiagnosticIds.EncodeError, message: 'nop expects no operands' },
    { label: 'halt', id: DiagnosticIds.EncodeError, message: 'halt expects no operands' },
    { label: 'di', id: DiagnosticIds.EncodeError, message: 'di expects no operands' },
    { label: 'ei', id: DiagnosticIds.EncodeError, message: 'ei expects no operands' },
    { label: 'scf', id: DiagnosticIds.EncodeError, message: 'scf expects no operands' },
    { label: 'ccf', id: DiagnosticIds.EncodeError, message: 'ccf expects no operands' },
    { label: 'cpl', id: DiagnosticIds.EncodeError, message: 'cpl expects no operands' },
    { label: 'daa', id: DiagnosticIds.EncodeError, message: 'daa expects no operands' },
    { label: 'rlca', id: DiagnosticIds.EncodeError, message: 'rlca expects no operands' },
    { label: 'rrca', id: DiagnosticIds.EncodeError, message: 'rrca expects no operands' },
    { label: 'rla', id: DiagnosticIds.EncodeError, message: 'rla expects no operands' },
    { label: 'rra', id: DiagnosticIds.EncodeError, message: 'rra expects no operands' },
    { label: 'exx', id: DiagnosticIds.EncodeError, message: 'exx expects no operands' },
    { label: 'neg', id: DiagnosticIds.EncodeError, message: 'neg expects no operands' },
    { label: 'reti', id: DiagnosticIds.EncodeError, message: 'reti expects no operands' },
    { label: 'retn', id: DiagnosticIds.EncodeError, message: 'retn expects no operands' },
    { label: 'rrd', id: DiagnosticIds.EncodeError, message: 'rrd expects no operands' },
    { label: 'rld', id: DiagnosticIds.EncodeError, message: 'rld expects no operands' },
    { label: 'ldi', id: DiagnosticIds.EncodeError, message: 'ldi expects no operands' },
    { label: 'ldir', id: DiagnosticIds.EncodeError, message: 'ldir expects no operands' },
    { label: 'ldd', id: DiagnosticIds.EncodeError, message: 'ldd expects no operands' },
    { label: 'lddr', id: DiagnosticIds.EncodeError, message: 'lddr expects no operands' },
    { label: 'cpi', id: DiagnosticIds.EncodeError, message: 'cpi expects no operands' },
    { label: 'cpir', id: DiagnosticIds.EncodeError, message: 'cpir expects no operands' },
    { label: 'cpd', id: DiagnosticIds.EncodeError, message: 'cpd expects no operands' },
    { label: 'cpdr', id: DiagnosticIds.EncodeError, message: 'cpdr expects no operands' },
    { label: 'ini', id: DiagnosticIds.EncodeError, message: 'ini expects no operands' },
    { label: 'inir', id: DiagnosticIds.EncodeError, message: 'inir expects no operands' },
    { label: 'ind', id: DiagnosticIds.EncodeError, message: 'ind expects no operands' },
    { label: 'indr', id: DiagnosticIds.EncodeError, message: 'indr expects no operands' },
    { label: 'outi', id: DiagnosticIds.EncodeError, message: 'outi expects no operands' },
    { label: 'otir', id: DiagnosticIds.EncodeError, message: 'otir expects no operands' },
    { label: 'outd', id: DiagnosticIds.EncodeError, message: 'outd expects no operands' },
    { label: 'otdr', id: DiagnosticIds.EncodeError, message: 'otdr expects no operands' },
  ] satisfies Row[])('$label — rejects extra operands on zero-operand known heads', async (row) => {
    const res = await compile(PR151_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: row.id,
      severity: 'error',
      message: row.message,
    });
  });

  it('does not fall back to generic unsupported-instruction for the zero-operand matrix fixture', async () => {
    const res = await compile(PR151_FIXTURE, {}, { formats: defaultFormatWriters });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
