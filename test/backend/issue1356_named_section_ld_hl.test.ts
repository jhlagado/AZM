import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Issue #1356: classic mem-indirect in named code section', () => {
  it('compiles ld a,(hl) without named-section fixup error', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'issue1356_named_section_ld_hl_indirect.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
  });

  it('compiles ld a,(bc) and ld a,(de) without named-section fixup error', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'issue1356_named_section_ld_bc_de_indirect.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
  });
});
