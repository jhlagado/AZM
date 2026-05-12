import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR182 parser: module var inferred-array recovery', () => {
  it('keeps parsing later declarations after inferred-array type rejection in module var blocks', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr182_var_block_inferred_array_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectDiagnostic(res.diagnostics, {
      message:
        'Inferred-length arrays (T[]) are only permitted in data declarations with an initializer.',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unsupported top-level construct:',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Invalid var declaration line',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'const declaration',
    });
    expectNoDiagnostic(res.diagnostics, {
      messageIncludes: 'Unterminated func',
    });
  });
});
