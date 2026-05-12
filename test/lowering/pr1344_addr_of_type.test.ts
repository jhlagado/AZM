import { describe, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';

describe('PR1344 @TypeName typed-pointer type expression (AddrOfType)', () => {
  it('compiles tree search with @TreeNode fields and parameters', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1344_addr_of_type_positive.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('rejects self-referential field type without @', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1344_self_ref_requires_addr.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Self-referential field type "TreeNode" requires a typed pointer; use @TreeNode.',
    });
  });
});
