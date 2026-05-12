import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR169 parser: malformed declaration header diagnostics matrix', () => {
  it('emits declaration-specific diagnostics for malformed enum/const/bin/hex headers', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr169_malformed_decl_header_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid enum member name "9bad": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid const declaration: missing initializer',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin name "1asset": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin section "text": expected "code" or "data".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin declaration: expected quoted source path',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid hex name "9dump": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid hex declaration: expected quoted source path',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
