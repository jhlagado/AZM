import { describe, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR221 lowering: op-expansion and ret cc interaction invariants', () => {
  it('diagnoses exact unknown-stack ret cc + fallthrough contract after inline op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_retcc_fallthrough.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses exact if/else join unknown-state contract with ret cc after op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_if_else_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses exact while back-edge unknown-state contract with ret cc after op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_while_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });

  it('diagnoses both return sites in multi-return functions after untrackable op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_multi_return.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
    });
  });
});
