import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR8 sizeof() in imm expressions', () => {
  it('evaluates sizeof(TypeName) using PR3 layouts', async () => {
    const entry = join(__dirname, 'fixtures', 'pr8_sizeof.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('diagnoses unknown types used in sizeof()', async () => {
    const entry = join(__dirname, 'fixtures', 'pr8_sizeof_unknown.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      message: 'Unknown type "Nope".',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "SzNope".',
    });
  });
});
