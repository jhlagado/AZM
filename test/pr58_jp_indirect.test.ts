import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { binBytes, containsSubsequence } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR58: ISA jp (rr) indirect', () => {
  it('encodes jp (hl)/(ix)/(iy)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr58_jp_indirect.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    expect(containsSubsequence(binBytes(res.artifacts), [0xe9, 0xdd, 0xe9, 0xfd, 0xe9])).toBe(true);
  });
});
