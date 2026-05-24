import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const PR129_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr129_isa_ed_zero_operand_invalid.asm', import.meta.url),
);

type Row = { label: string; message: string };

describe('PR129: ED zero-operand diagnostics parity', () => {
  it.each([
    { label: 'reti', message: 'reti expects no operands' },
    { label: 'retn', message: 'retn expects no operands' },
    { label: 'ldi', message: 'ldi expects no operands' },
    { label: 'ldir', message: 'ldir expects no operands' },
    { label: 'cpi', message: 'cpi expects no operands' },
    { label: 'cpdr', message: 'cpdr expects no operands' },
    { label: 'ini', message: 'ini expects no operands' },
    { label: 'otdr', message: 'otdr expects no operands' },
  ] satisfies Row[])('$label — explicit no-operand diagnostic', async (row) => {
    const res = await compile(PR129_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: row.message,
    });
  });
});
