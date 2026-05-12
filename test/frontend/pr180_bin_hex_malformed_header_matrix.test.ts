import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR180 parser: malformed bin/hex header matrix', () => {
  it('emits shape-specific diagnostics for malformed bin/hex declarations', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr180_bin_hex_malformed_header_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin declaration line "bin": expected <name> in <code|data> from "<path>"',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'Invalid bin declaration line "bin asset": expected <name> in <code|data> from "<path>"',
    });
    expectDiagnostic(res.diagnostics, {
      message:
        'Invalid bin declaration line "bin asset in code": expected <name> in <code|data> from "<path>"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin section "text": expected "code" or "data".',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin name "1asset": expected <identifier>.',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid bin declaration: expected quoted source path',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid hex declaration line "hex": expected <name> from "<path>"',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'Invalid hex declaration line "hex dump": expected <name> from "<path>"',
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
