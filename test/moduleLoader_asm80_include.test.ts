import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('asm80 source mode and classic includes', () => {
  it.each(['main.z80', 'main.asm'])('infers asm80 source mode from %s', async (filename) => {
    await withTempDir('zax-asm80-mode-', async (dir) => {
      const entry = join(dir, filename);
      await writeFile(entry, 'LD A,1\n', 'utf8');

      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics).toEqual([]);
    });
  });

  it('expands classic .include directives relative to the including file before asm80 parsing', async () => {
    await withTempDir('zax-asm80-include-', async (dir) => {
      await mkdir(join(dir, 'sub'));
      const entry = join(dir, 'main.z80');
      const child = join(dir, 'sub', 'child.inc');
      const leaf = join(dir, 'sub', 'leaf.inc');
      await writeFile(entry, '.include "sub/child.inc"\n', 'utf8');
      await writeFile(child, '.include "leaf.inc"\n', 'utf8');
      await writeFile(leaf, 'LD A,1\n', 'utf8');

      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics).toEqual([]);
    });
  });
});
