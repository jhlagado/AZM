import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR164 parser: extern missing-end recovery', () => {
  it('recovers at next top-level declaration and emits focused extern diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr164_extern_missing_end_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated extern "legacy": expected "end" before "const"',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid extern func declaration',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
