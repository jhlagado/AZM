import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR189 parser: globals keyword diagnostics matrix', () => {
  it('emits globals-specific diagnostics for malformed module globals blocks', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr189_globals_parser_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid globals declaration line "globals extra": expected globals',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid globals declaration name "func": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Duplicate globals declaration name "a".',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid var declaration line "tmp byte": expected <name>: <type>',
    });
  });
});
