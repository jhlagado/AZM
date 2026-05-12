import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR183 parser: invalid block type shape diagnostics matrix', () => {
  it('emits expected-shape diagnostics for invalid type expressions in block declarations', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr183_block_invalid_type_shape_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid record field declaration line "bad: [byte]": expected <name>: <type>',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid union field declaration line "bad: [word]": expected <name>: <type>',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid globals declaration line "bad: [byte]": expected <name>: <type>',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Invalid data declaration line "bad: [byte] = 2": expected <name>: <type> = <initializer>',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported field type',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported type in var declaration',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported type in data declaration',
    });
  });
});
