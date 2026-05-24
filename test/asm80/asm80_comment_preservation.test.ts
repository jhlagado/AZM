import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import type { Asm80Artifact } from '../../src/outputs/types.js';

describe('ASM80 comment preservation', () => {
  it('keeps user comments distinct from generated comments', async () => {
    const entry = fileURLToPath(
      new URL('../fixtures/pr991_comment_preservation.asm', import.meta.url),
    );
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
    const asm80 = res.artifacts.find((artifact): artifact is Asm80Artifact => artifact.kind === 'asm80');
    expect(asm80).toBeDefined();

    const text = asm80!.text;
    expect(text).toContain('; counter value');
    expect(text).toContain('; loop top');
    expect(text).toContain('; load counter');
    expect(text).toContain('; done');
  });
});
