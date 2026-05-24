import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const PR134_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr134_alu_arity_diag_invalid.asm', import.meta.url),
);

describe('PR134: ALU operand-count diagnostics parity', () => {
  it('reports explicit diagnostics for malformed ALU operand counts/forms', async () => {
    const res = await compile(PR134_FIXTURE, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    expectDiagnostic(res.diagnostics, {
      message: 'sub expects one operand, or two with destination A',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'cp expects one operand, or two with destination A',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'and two-operand form requires destination A',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'or two-operand form requires destination A',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'xor two-operand form requires destination A',
    });
    expectDiagnostic(res.diagnostics, { message: 'adc expects destination A or HL' });
    expectDiagnostic(res.diagnostics, { message: 'sbc expects destination A or HL' });
  });
});
