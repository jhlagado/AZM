import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR136: bit indexed-destination invalid form', () => {
  it('diagnoses unsupported three-operand bit form with indexed source', async () => {
    const entry = join(__dirname, 'fixtures', 'pr136_bit_indexed_dest_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, { message: 'bit expects two operands' });
  });
});
