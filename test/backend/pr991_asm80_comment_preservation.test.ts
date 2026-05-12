import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Asm80Artifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ASM80 comment preservation', () => {
  it('keeps user comments distinct from generated comments', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr991_comment_preservation.zax');
    const res = await compile(
      entry,
      {
        emitAsm80: true,
        emitBin: false,
        emitHex: false,
        emitListing: false,
        emitD8m: false,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toEqual([]);
    const asm80 = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(asm80).toBeDefined();

    const text = asm80!.text;
    expect(text).toContain('; counter value');
    expect(text).toContain('; loop top');
    expect(text).toContain('; load counter');
    expect(text).toContain('; done');
    expect(text).toMatch(/; ZAX:/);
  });
});
