import { describe, it } from 'vitest';

import { expectBackendFixtureDiagnostics } from './isaDiagnosticTestHelpers.js';

describe('PR131: core zero-operand diagnostics', () => {
  it('reports explicit no-operand diagnostics for malformed core forms', async () => {
    await expectBackendFixtureDiagnostics('pr131_isa_zero_operand_core_invalid.asm', [
      'nop expects no operands',
      'halt expects no operands',
      'di expects no operands',
      'ei expects no operands',
      'scf expects no operands',
      'ccf expects no operands',
      'cpl expects no operands',
      'daa expects no operands',
      'rlca expects no operands',
      'rrca expects no operands',
      'rla expects no operands',
      'rra expects no operands',
      'exx expects no operands',
    ]);
  });
});
