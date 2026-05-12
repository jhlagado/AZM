import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR161 parser: var/data keyword-name diagnostics parity', () => {
  it('rejects declaration names that collide with top-level keywords', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr161_var_data_keyword_name_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid globals declaration name "func": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid globals declaration name "data": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid data declaration name "op": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid data declaration name "import": collides with a top-level keyword.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
