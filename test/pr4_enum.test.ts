import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR4 enum parsing', () => {
  it('evaluates enum members in imm expressions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_enum.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('rejects unqualified enum member references', async () => {
    const entry = join(__dirname, 'fixtures', 'pr259_enum_unqualified_member.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Unqualified enum member "Write" is not allowed; use "Mode.Write".',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "Bad".',
    });
  });

  it('diagnoses ambiguous unqualified enum member references', async () => {
    const entry = join(__dirname, 'fixtures', 'pr265_enum_unqualified_ambiguous.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Unqualified enum member "On" is ambiguous; use one of: ModeA.On, ModeB.On.',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "Bad".',
    });
  });
});
