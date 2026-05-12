import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR555: function-local SP tracking remains isolated', () => {
  it('preserves typed and raw call-boundary diagnostics across functions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr275_typed_vs_raw_call_boundary_diag.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes:
        'typed call "callee_typed" reached with unknown stack depth; cannot verify typed-call boundary contract.',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes:
        'call reached with unknown stack depth; cannot verify callee stack contract.',
    });
  });
});
