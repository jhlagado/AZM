import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR146: known-head diagnostics avoid unsupported fallback', () => {
  it('uses specific diagnostics for malformed known instruction heads', async () => {
    const entry = join(__dirname, 'fixtures', 'pr146_known_head_no_unsupported.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

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
