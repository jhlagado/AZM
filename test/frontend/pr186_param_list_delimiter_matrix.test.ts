import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR186 parser: parameter list delimiter diagnostics matrix', () => {
  it('emits explicit diagnostics for trailing/empty func/op/extern parameter entries', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr186_param_list_delimiter_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid parameter list: trailing or empty entries are not permitted.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid op parameter list: trailing or empty entries are not permitted.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid parameter declaration: expected <name>: <type>',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid op parameter declaration: expected <name>: <matcher>',
    });
  });
});
