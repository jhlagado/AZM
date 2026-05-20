import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR169 parser: malformed declaration header diagnostics matrix', () => {
  it('emits declaration-specific diagnostics for malformed enum headers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr169_malformed_decl_header_matrix.asm');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid enum member name "9bad": expected <identifier>.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
