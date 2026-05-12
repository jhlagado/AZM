import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR130: in/out/im/rst operand-count diagnostics', () => {
  it('reports explicit arity diagnostics for malformed instruction forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr130_isa_inout_im_rst_arity_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'rst expects one operand' });
    expectDiagnostic(res.diagnostics, { message: 'im expects one operand' });
    expectDiagnostic(res.diagnostics, { message: 'in expects one or two operands' });
    expectDiagnostic(res.diagnostics, { message: 'out expects two operands' });
  });
});
