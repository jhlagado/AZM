import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR220 lowering: ret cc invariants across if/else and repeat/until', () => {
  it('diagnoses exact unknown-stack ret cc contract for if/else join mismatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr220_lowering_unknown_retcc_if_else_join.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses exact untracked-SP ret cc contract for if/else join mutation', async () => {
    const entry = join(__dirname, 'fixtures', 'pr220_lowering_untracked_retcc_if_else_join.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses exact unknown-stack ret cc contract for repeat/until mismatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr220_lowering_unknown_retcc_repeat_until.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses exact untracked-SP ret cc contract for repeat/until mutation', async () => {
    const entry = join(__dirname, 'fixtures', 'pr220_lowering_untracked_retcc_repeat_until.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });
});
