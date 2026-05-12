import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR134: ALU operand-count diagnostics parity', () => {
  it('reports explicit diagnostics for malformed ALU operand counts/forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr134_alu_arity_diag_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'sub expects one operand, or two with destination A',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'cp expects one operand, or two with destination A',
    });
    expectDiagnostic(res.diagnostics, { message: 'and two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'or two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'xor two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'adc expects destination A or HL' });
    expectDiagnostic(res.diagnostics, { message: 'sbc expects destination A or HL' });
  });
});
