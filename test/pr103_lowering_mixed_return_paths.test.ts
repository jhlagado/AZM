import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR103 lowering mixed return-path stack diagnostics', () => {
  it('accepts mixed branch returns when plain ret preserves stack balance', async () => {
    const entry = join(__dirname, 'fixtures', 'pr103_mixed_returns_ret_imbalance.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);
    expect(res.artifacts.length).toBeGreaterThan(0);
  });

  it('diagnoses ret cc stack imbalance inside a mixed branch return path', async () => {
    const entry = join(__dirname, 'fixtures', 'pr103_mixed_returns_retcc_imbalance.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      severity: 'error',
      messageIncludes: 'Stack depth mismatch at if/else join',
    });
  });
});
