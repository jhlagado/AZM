import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR131: core zero-operand diagnostics', () => {
  it('reports explicit no-operand diagnostics for malformed core forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr131_isa_zero_operand_core_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'nop expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'halt expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'di expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'ei expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'scf expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'ccf expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'cpl expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'daa expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'rlca expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'rrca expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'rla expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'rra expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'exx expects no operands' });
  });
});
