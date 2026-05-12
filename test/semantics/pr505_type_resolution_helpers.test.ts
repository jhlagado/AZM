import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR505: extracted type-resolution helpers', () => {
  it('preserves scalar index value semantics for ld lowering', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr260_value_semantics_scalar_index.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoDiagnostics(res.diagnostics);
  });

  it('preserves non-scalar typed-call compatibility diagnostics', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr286_nonscalar_param_compat_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Incompatible non-scalar argument for parameter "values": expected byte[10], got byte[] (exact length proof required).',
    });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      message:
        'Incompatible non-scalar argument for parameter "values": expected element type byte, got word.',
    });
  });
});
