import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic, expectNoErrors } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR123 ISA: core ALU-A matrix', () => {
  it('encodes add/adc/sub/sbc/and/or/xor/cp across reg8, (hl), and imm8', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr123_isa_alu_a_core.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('diagnoses imm8 out-of-range ALU immediates', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr123_isa_alu_a_core_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, { messageIncludes: 'expects imm8' });
  });
});
