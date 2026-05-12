import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR160 parser: type/union missing-end recovery', () => {
  it('stops block parsing at next top-level declaration and emits focused diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr160_type_union_missing_end_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated type "Point": expected "end" before "func"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Unterminated union "Pair": expected "end" before "const"',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid record field declaration',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid union field declaration',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
