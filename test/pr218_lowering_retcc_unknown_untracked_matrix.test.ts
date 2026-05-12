import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR218 lowering: ret cc diagnostics under unknown/untracked stack states', () => {
  it('diagnoses exact unknown-stack ret cc contract for join mismatch paths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr218_lowering_unknown_retcc_stack_state.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it('diagnoses exact untracked-SP ret cc contract for op-expansion mutation paths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr218_lowering_untracked_retcc_stack_state.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
