import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR168 parser: declaration duplicate-name matrix', () => {
  it('emits declaration-specific duplicate diagnostics without fallback drift', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr168_declaration_duplicate_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate record field name "X".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate union field name "A".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate enum member name "red".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid enum member name "func": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate globals declaration name "Counter".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate var declaration name "TMP".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate data declaration name "TABLE".',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
