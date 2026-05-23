import { describe, expect, it } from 'vitest';

import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics/index.js';
import { compileBackendFixture } from './isaDiagnosticTestHelpers.js';

describe('PR91: ISA adc/sbc HL,rr', () => {
  it('encodes adc/sbc HL,BC/DE/HL/SP (ED forms)', async () => {
    const res = await compileBackendFixture('pr91_isa_hl16_adc_sbc.asm');
    expectNoErrors(res.diagnostics);
  });

  it('diagnoses unsupported rr in adc HL,rr', async () => {
    const res = await compileBackendFixture('pr91_isa_hl16_adc_sbc_invalid.asm');
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, { messageIncludes: 'adc HL, rr expects BC/DE/HL/SP' });
  });
});
