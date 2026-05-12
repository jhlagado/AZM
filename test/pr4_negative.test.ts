import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR4 negative cases', () => {
  it('diagnoses undefined names in const expressions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_undefined_name.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "X".',
    });
  });

  it('diagnoses forward references in const expressions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_forward_ref.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "B".',
    });
  });

  it('diagnoses mismatched string initializer lengths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_data_length_mismatch.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message: 'String length mismatch for "msg".',
    });
  });

  it('diagnoses unsupported data types', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_data_unsupported_type.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message:
        'Unsupported data type for "p" (expected byte/word/addr or fixed-length arrays of those).',
    });
  });
});
