import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function expectEmitError(fixtureName: string, messageIncludes: string): Promise<void> {
  const entry = join(__dirname, 'fixtures', fixtureName);
  const res = await compile(entry, {}, { formats: defaultFormatWriters });
  expect(res.artifacts).toEqual([]);
  expectDiagnostic(res.diagnostics, {
    id: DiagnosticIds.EmitError,
    severity: 'error',
    messageIncludes,
  });
}

describe('PR37 fixup negatives', () => {
  it('diagnoses unresolved abs16 fixup symbols', async () => {
    await expectEmitError('pr37_unresolved_symbol_abs16.asm', 'Unresolved symbol "missing_label"');
  });

  it('diagnoses unresolved rel8 fixup symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_unresolved_symbol_rel8.asm');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: 'Unresolved symbol "missing_label"',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: 'rel8 jr fixup',
    });
  });

  it('diagnoses rel8 out-of-range fixups', async () => {
    await expectEmitError('pr37_rel8_out_of_range.asm', 'jr target out of range for rel8 branch');
  });

  it('diagnoses conditional jr rel8 out-of-range fixups', async () => {
    await expectEmitError(
      'pr37_rel8_out_of_range_jr_cond.asm',
      'jr nz target out of range for rel8 branch',
    );
  });

  it('diagnoses djnz rel8 out-of-range fixups', async () => {
    await expectEmitError(
      'pr37_rel8_out_of_range_djnz.asm',
      'djnz target out of range for rel8 branch',
    );
  });
});
