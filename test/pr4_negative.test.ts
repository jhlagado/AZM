import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR4 negative cases', () => {
  it('diagnoses undefined names in native equ expressions used by instructions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_undefined_name.asm');
    const res = await compile(entry, { sourceMode: 'azm' }, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EncodeError,
      severity: 'error',
      message: 'ld expects a supported register/memory/immediate transfer form',
    });
  });
});
