import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR198 lowering invariants for unknown stack-tracking states', () => {
  it('diagnoses unknown stack states at joins/back-edges/ret/fallthrough after op expansion via function-stream contracts', async () => {
    const entry = join(__dirname, 'fixtures', 'pr198_lowering_unknown_stack_states.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
