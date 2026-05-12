import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR165 parser: data keyword-name recovery', () => {
  it('reports keyword-name collisions in data blocks without cascading to top-level parse errors', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr165_data_keyword_name_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid data declaration name "func": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid data declaration name "op": collides with a top-level keyword.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid func header',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
