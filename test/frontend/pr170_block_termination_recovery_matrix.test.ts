import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR170 parser: block termination recovery matrix', () => {
  it('emits explicit interrupted-block diagnostics for type/union/extern and keeps parsing', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr170_block_termination_recovery_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Unterminated type "Point": expected "end" before "const"',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Unterminated union "Pair": expected "end" before "globals"',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Unterminated extern "legacy": expected "end" before "data"',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
