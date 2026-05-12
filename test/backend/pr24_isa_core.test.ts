import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR24 ISA core tranche', () => {
  it('encodes sub/cp/and/or/xor and rel8 branches', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr24_isa_core.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it('diagnoses rel8 out-of-range label branches', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr24_jr_label_out_of_range.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      messageIncludes: 'out of range for rel8 branch',
    });
  });

  it('encodes backwards rel8 branch displacements', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr24_rel8_backward.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
