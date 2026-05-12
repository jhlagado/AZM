import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR185 parser: block invalid identifier diagnostics matrix', () => {
  it('emits explicit invalid-identifier diagnostics across declaration blocks', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr185_block_invalid_identifier_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid record field name "9field": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid union field name "9part": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid globals declaration name "9global": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid data declaration name "9blob": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid enum member name "9bad": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid var declaration name "9local": expected <identifier>.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
