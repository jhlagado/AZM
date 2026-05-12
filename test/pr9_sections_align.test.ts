import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { expectDiagnostic, expectNoDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR9 sections + align', () => {
  it('applies align to the active section counter', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_align_between_funcs.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('rejects legacy active-counter section base directives', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_section_code_at.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        id: DiagnosticIds.ParseError,
        message:
          'Legacy active-counter section directive "section code at ..." is removed; use a named section like "section code <name> at ..." instead.',
      }),
    ]);
  });

  it('rejects legacy overlapping section directives before overlap analysis', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_overlap_code_data.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      messageIncludes: 'Legacy active-counter section directive "section data at ..." is removed',
    });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'Byte overlap' });
  });

  it('rejects legacy section bases before range validation runs', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_invalid_code_base_no_overlap.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.ParseError,
      messageIncludes: 'Legacy active-counter section directive "section code at ..." is removed',
    });
    expectNoDiagnostic(res.diagnostics, { messageIncludes: 'base address out of range' });
  });
});
