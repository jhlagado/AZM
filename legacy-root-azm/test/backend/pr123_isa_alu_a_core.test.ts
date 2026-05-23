import { describe, expect, it } from 'vitest';

import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics/index.js';
import { compileBackendFixture } from './isaDiagnosticTestHelpers.js';

describe('PR123 ISA: core ALU-A matrix', () => {
  it('encodes add/adc/sub/sbc/and/or/xor/cp across reg8, (hl), and imm8', async () => {
    const res = await compileBackendFixture('pr123_isa_alu_a_core.asm');
    expectNoErrors(res.diagnostics);
  });

  it('diagnoses imm8 out-of-range ALU immediates', async () => {
    const res = await compileBackendFixture('pr123_isa_alu_a_core_invalid.asm');
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, { messageIncludes: 'expects imm8' });
  });
});
