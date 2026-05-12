import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR507: extracted EA resolution helpers', () => {
  it('preserves scalar index value semantics for nested EA resolution', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr260_value_semantics_scalar_index.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoDiagnostics(res.diagnostics);
  });

  it('preserves runtime-affine unsupported-shape diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr272_runtime_affine_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message:
        'Runtime array index expression is unsupported. Use a single scalar runtime atom with +, -, *, << and constants (no /, %, &, |, ^, >> on runtime atoms).',
    });
  });
});
