import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR952 raw ix slot offsets', () => {
  it('resolves arg/local names inside raw ix displacements', async () => {
    const entry = join(__dirname, 'fixtures', 'pr952_raw_ix_slot_offsets_ok.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
  });

  it('keeps raw ld working for typed globals', async () => {
    const entry = join(__dirname, 'fixtures', 'pr952_raw_ix_slot_offsets_globals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
  });

  it('rejects alias-only locals as ix slot offsets', async () => {
    const entry = join(__dirname, 'fixtures', 'pr952_raw_ix_slot_offsets_alias.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message: 'Alias "alias" has no frame slot; cannot be used as a raw IX offset.',
    });
  });

  it('diagnoses out-of-range ix displacements', async () => {
    const entry = join(__dirname, 'fixtures', 'pr952_raw_ix_slot_offsets_range.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message: 'IX/IY displacement out of range (-128..127): 204.',
    });
  });
});
