import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR126 ISA: CB bit/res/set reg matrix', () => {
  it('encodes bit/res/set across reg8 + (hl) and all bit indices', async () => {
    const entry = join(__dirname, 'fixtures', 'pr126_cb_bitops_reg_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('diagnoses invalid bit indices for reg8', async () => {
    const entry = join(__dirname, 'fixtures', 'pr126_cb_bitops_invalid_reg_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, { messageIncludes: 'expects bit index 0..7' });
  });
});
