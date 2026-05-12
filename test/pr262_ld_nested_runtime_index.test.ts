import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR262 nested runtime index lowering for ld forms', () => {
  it('rejects ld forms with two runtime atoms in one ea expression', async () => {
    const entry = join(__dirname, 'fixtures', 'pr262_ld_nested_runtime_index.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    const budgetDiagnostics = res.diagnostics.filter(
      (d) => d.message === 'Source ea expression exceeds runtime-atom budget (max 1; found 2).',
    );
    expect(budgetDiagnostics).toHaveLength(2);
  });
});
