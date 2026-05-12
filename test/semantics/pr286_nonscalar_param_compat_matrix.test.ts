import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR286: non-scalar typed-call parameter compatibility', () => {
  it('accepts T[N] -> T[] and exact T[N] -> T[N] non-scalar arguments', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr286_nonscalar_param_compat_positive.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);
  });

  it('rejects T[] -> T[N] without proof and rejects element-type mismatches', async () => {
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
