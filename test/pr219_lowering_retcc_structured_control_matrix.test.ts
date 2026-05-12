import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR219 lowering: ret cc invariants across structured-control joins/back-edges', () => {
  it('diagnoses exact unknown-stack ret cc contract for while back-edge mismatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr219_lowering_unknown_retcc_while_backedge.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses exact unknown-stack ret cc contract for select-join mismatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr219_lowering_unknown_retcc_select_join.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses exact untracked-SP ret cc contract for select-join mutation', async () => {
    const entry = join(__dirname, 'fixtures', 'pr219_lowering_untracked_retcc_select_join.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });
});
