import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR145_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr145_alu_diag_no_unsupported.asm', import.meta.url),
);

/**
 * Compile-time matrix for oracle `legacy-root-azm/test/pr145_alu_diag_no_unsupported.test.ts`.
 * Fixture `pr145_alu_diag_no_unsupported.asm` — two-operand ALU forms that require destination A (or HL for adc/sbc).
 */
describe('PR145: ALU diagnostics suppress generic fallback', () => {
  it('reports specific ALU diagnostics without unsupported-instruction cascades', async () => {
    const res = await compile(PR145_FIXTURE, {}, { formats: defaultFormatWriters });

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
