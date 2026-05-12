import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoErrors } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR48: lower ld (ea), imm16 for word/addr destinations', () => {
  it('lowers ld (abs-word), imm16 via ld (nn),hl', async () => {
    const entry = join(__dirname, 'fixtures', 'pr48_ld_mem_imm16_abs.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('lowers ld (stack-word), imm16 with frame + epilogue', async () => {
    const entry = join(__dirname, 'fixtures', 'pr48_ld_mem_imm16_stack.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });

  it('diagnoses imm16 into byte destination', async () => {
    const entry = join(__dirname, 'fixtures', 'pr48_ld_mem_imm16_invalid_byte.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.EmitError,
      severity: 'error',
      message: 'ld (ea), imm expects imm8.',
    });
  });
});
