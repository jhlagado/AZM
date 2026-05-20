import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { binBytes, containsSubsequence } from '../test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR56: ISA misc single-byte ops', () => {
  it('encodes common misc ops', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr56_isa_misc.asm');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    expect(
      containsSubsequence(binBytes(res.artifacts), [
        0xf3, // di
        0xfb, // ei
        0x37, // scf
        0x3f, // ccf
        0x2f, // cpl
        0xeb, // ex de,hl
        0xe3, // ex (sp),hl
        0xd9, // exx
        0x76, // halt
      ]),
    ).toBe(true);
  });
});
