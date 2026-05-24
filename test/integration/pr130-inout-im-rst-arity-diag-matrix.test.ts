import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const PR130_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr130_isa_inout_im_rst_arity_invalid.asm', import.meta.url),
);

type Row = { label: string; message: string };

describe('PR130: in/out/im/rst operand-count diagnostics parity', () => {
  it.each([
    { label: 'rst', message: 'rst expects one operand' },
    { label: 'im', message: 'im expects one operand' },
    { label: 'in', message: 'in expects one or two operands' },
    { label: 'out', message: 'out expects two operands' },
  ] satisfies Row[])('$label — explicit arity diagnostic', async (row) => {
    const res = await compile(PR130_FIXTURE, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: row.message,
    });
  });
});
