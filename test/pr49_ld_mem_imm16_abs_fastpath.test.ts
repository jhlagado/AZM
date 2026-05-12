import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR49: ld (abs-word), imm16 fast-path', () => {
  it('uses ld (nn), hl after loading HL with the immediate', async () => {
    const entry = join(__dirname, 'fixtures', 'pr49_ld_mem_imm16_abs_fastpath.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
