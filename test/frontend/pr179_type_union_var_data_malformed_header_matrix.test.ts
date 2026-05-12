import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR179 parser: malformed type/union/var/data headers', () => {
  it('emits explicit expected-shape diagnostics for malformed type/union/var/data declarations', async () => {
    const entry = join(__dirname, '..', 'fixtures',
      'pr179_type_union_var_data_malformed_header_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid type declaration line "type": expected <name> [<typeExpr>]',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid type name "9Bad": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid type declaration line "type Word =": expected <name> [<typeExpr>]',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid type declaration line "type Word [byte]": expected <name> [<typeExpr>]',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid union declaration line "union": expected <name>',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid union name "9Pair": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid union name "Pair extra": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid globals declaration line "globals extra": expected globals',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid data declaration line "data extra": expected data',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
