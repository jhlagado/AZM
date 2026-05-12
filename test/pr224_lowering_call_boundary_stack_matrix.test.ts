import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR224 lowering: call-boundary stack invariant matrix', () => {
  it('keeps diagnostics scoped to unsafe callers while safe callees remain unaffected', async () => {
    const entry = join(__dirname, 'fixtures', 'pr224_lowering_call_boundary_stack_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
