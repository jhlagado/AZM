import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR129: ED zero-operand diagnostics', () => {
  it('reports explicit diagnostics when ED zero-operand mnemonics are given operands', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr129_isa_ed_zero_operand_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'reti expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'retn expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'ldi expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'ldir expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'cpi expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'cpdr expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'ini expects no operands' });
    expectDiagnostic(res.diagnostics, { message: 'otdr expects no operands' });
  });
});
