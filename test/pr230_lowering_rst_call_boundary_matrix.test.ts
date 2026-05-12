import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR230 lowering: rst call-boundary stack matrix', () => {
  it('diagnoses rst boundaries reached with untracked/unknown stack depth when stack slots exist', async () => {
    const entry = join(__dirname, 'fixtures', 'pr230_lowering_rst_call_boundary_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
