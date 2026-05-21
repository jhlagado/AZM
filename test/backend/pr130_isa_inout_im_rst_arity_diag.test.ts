import { describe, it } from 'vitest';

import { expectBackendFixtureDiagnostics } from './isaDiagnosticTestHelpers.js';

describe('PR130: in/out/im/rst operand-count diagnostics', () => {
  it('reports explicit arity diagnostics for malformed instruction forms', async () => {
    await expectBackendFixtureDiagnostics('pr130_isa_inout_im_rst_arity_invalid.asm', [
      'rst expects one operand',
      'im expects one operand',
      'in expects one or two operands',
      'out expects two operands',
    ]);
  });
});
