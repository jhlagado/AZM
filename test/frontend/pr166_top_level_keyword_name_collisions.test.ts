import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR166 parser: top-level keyword-name collisions', () => {
  it('reports declaration-specific diagnostics when names collide with reserved top-level keywords', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr166_top_level_keyword_name_collisions.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid type name "func": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid union name "data": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid enum name "import": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid const name "op": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid bin name "extern": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid hex name "section": collides with a top-level keyword.',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message: 'Invalid extern func name "type": collides with a top-level keyword.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
  });
});
