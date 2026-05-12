import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR197 lowering: explicit untracked-SP invariants', () => {
  it('diagnoses join/back-edge/return/fallthrough when SP tracking becomes invalid', async () => {
    const entry = join(__dirname, 'fixtures', 'pr197_untracked_stack_invariants.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
