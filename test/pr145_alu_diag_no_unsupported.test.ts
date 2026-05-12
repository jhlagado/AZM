import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR145: ALU diagnostics suppress generic fallback', () => {
  it('reports specific ALU diagnostics without unsupported-instruction cascades', async () => {
    const entry = join(__dirname, 'fixtures', 'pr145_alu_diag_no_unsupported.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'sub two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'cp two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'and two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'or two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'xor two-operand form requires destination A' });
    expectDiagnostic(res.diagnostics, { message: 'adc expects destination A or HL' });
    expectDiagnostic(res.diagnostics, { message: 'sbc expects destination A or HL' });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Unsupported instruction:' });
  });
});
