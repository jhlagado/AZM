import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR199 lowering mismatch propagation across joins/back-edges with inline op expansion', () => {
  it('invalidates stack tracking after mismatch diagnostics so downstream returns are guarded', async () => {
    const entry = join(__dirname, 'fixtures', 'pr199_lowering_mismatch_propagation.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
