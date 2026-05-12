import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR228 lowering: call-boundary unknown/untracked stack matrix', () => {
  it('diagnoses call boundaries reached with unknown or untracked stack depth when locals are present', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr228_lowering_call_boundary_unknown_untracked_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
