import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR285 parser/AST closure: alias-init vs value-init', () => {
  it('accepts named data-section value-init and local inferred alias-init forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr285_alias_init_globals_locals_positive.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoErrors(res.diagnostics);
  });

  it('rejects non-constant names in typed local initializers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr285_typed_alias_invalid_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Invalid local constant initializer for "bad_local": "base" is not a compile-time constant.',
    });
  });

  it('rejects local inferred alias declarations when rhs is not an address expression', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr285_incompatible_inferred_alias_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Function-local alias "bad_local" must target a direct module-scope storage name.',
    });
  });

  it('rejects non-scalar local storage declarations without alias form', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr285_local_nonscalar_without_alias_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Non-scalar local storage declaration "local_arr" requires alias form ("local_arr = rhs").',
    });
  });
});
