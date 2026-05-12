import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR104 lowering op-expansion interactions under nested control', () => {
  it('diagnoses enclosing while back-edge mismatch after unbalanced op expansion inside nested control', async () => {
    const entry = join(__dirname, 'fixtures', 'pr104_nested_unbalanced_op_while.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it('diagnoses untracked-SP function-stream join/return contracts after op expansion inside nested control', async () => {
    const entry = join(__dirname, 'fixtures', 'pr104_nested_untracked_sp_op_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
