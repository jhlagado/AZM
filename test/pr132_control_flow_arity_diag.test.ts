import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR132: control-flow operand-count diagnostics', () => {
  it('reports explicit arity diagnostics for malformed ret/call/jp forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr132_control_flow_arity_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'ret expects no operands or one condition code' });
    expectDiagnostic(res.diagnostics, {
      message: 'call expects one operand (nn) or two operands (cc, nn)',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
    });
  });
});
