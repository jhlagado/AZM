import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR167 parser: header and parameter name validation matrix', () => {
  it('emits declaration-specific diagnostics for reserved/duplicate names in headers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr167_header_param_name_validation_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid func name "data": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate parameter name "a".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid op parameter name "func": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Duplicate op parameter name "a".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid extern func name "const": collides with a top-level keyword.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
