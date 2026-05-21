import { describe, it } from 'vitest';

import { expectBackendFixtureDiagnostics } from './isaDiagnosticTestHelpers.js';

describe('PR129: ED zero-operand diagnostics', () => {
  it('reports explicit diagnostics when ED zero-operand mnemonics are given operands', async () => {
    await expectBackendFixtureDiagnostics('pr129_isa_ed_zero_operand_invalid.asm', [
      'reti expects no operands',
      'retn expects no operands',
      'ldi expects no operands',
      'ldir expects no operands',
      'cpi expects no operands',
      'cpdr expects no operands',
      'ini expects no operands',
      'otdr expects no operands',
    ]);
  });
});
