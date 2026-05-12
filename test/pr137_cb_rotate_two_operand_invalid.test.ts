import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR137: CB rotate/shift invalid two-operand diagnostics', () => {
  it('reports explicit diagnostics for malformed two-operand rotate/shift forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr137_cb_rotate_two_operand_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'rl two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'rr two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'sla two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'sra two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'srl two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'sll two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'rlc two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'rrc two-operand form requires (ix/iy+disp) source' });
    expectDiagnostic(res.diagnostics, { message: 'rl (ix/iy+disp),r expects reg8 destination' });
    expectDiagnostic(res.diagnostics, { message: 'rr (ix/iy+disp),r expects reg8 destination' });
  });
});
