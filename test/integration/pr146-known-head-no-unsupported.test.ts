import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics/index.js';

const PR146_FIXTURE = fileURLToPath(
  new URL('../fixtures/pr146_known_head_no_unsupported.asm', import.meta.url),
);

/**
 * Compile-time matrix for oracle `legacy-root-azm/test/pr146_known_head_no_unsupported.test.ts`.
 * Fixture `pr146_known_head_no_unsupported.asm` — known instruction heads must not fall back to generic unsupported.
 */
describe('PR146: known-head diagnostics avoid unsupported fallback', () => {
  it('uses specific diagnostics for malformed known instruction heads', async () => {
    const res = await compile(PR146_FIXTURE, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'ld IXH, source expects (ix+disp)' });
    expectDiagnostic(res.diagnostics, {
      message: `ex supports "AF, AF'", "DE, HL", "(SP), HL", "(SP), IX", and "(SP), IY" only`,
    });
    expectDiagnostic(res.diagnostics, {
      message: 'jp indirect form supports (hl), (ix), or (iy) only',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'in (c) is the only one-operand in form',
    });
    expectDiagnostic(res.diagnostics, { message: 'out expects two operands' });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported instruction:',
    });
  });
});
