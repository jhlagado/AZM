import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { loadProgram } from '../src/api-tooling.js';
import { defaultFormatWriters } from '../src/formats/index.js';

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('.asm/.z80 source extensions and includes', () => {
  it.each(['main.z80', 'main.asm'])(
    'accepts assembler source extension from %s',
    async (filename) => {
      await withTempDir('azm-z80-mode-', async (dir) => {
        const entry = join(dir, filename);
        await writeFile(entry, 'LD A,1\n', 'utf8');

        const res = await compile(
          entry,
          { emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
          { formats: defaultFormatWriters },
        );

        expect(res.diagnostics).toEqual([]);
      });
    },
  );

  it('expands .include directives relative to the including file before parsing', async () => {
    await withTempDir('azm-z80-include-', async (dir) => {
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

  it('uses the default AZM directive aliases through the public tooling loader', async () => {
    await withTempDir('azm-tooling-z80-aliases-', async (dir) => {
      const entry = join(dir, 'main.z80');
      const child = join(dir, 'child.inc');
      await writeFile(entry, ['ORG 4000H', 'INCLUDE "child.inc"', 'END'].join('\n'), 'utf8');
      await writeFile(child, ['DATA: DB 1', 'DS 1'].join('\n'), 'utf8');

      const res = await loadProgram({ entryFile: entry });

      expect(res.diagnostics).toEqual([]);
      const itemKinds = res.loadedProgram?.program.files[0]?.items.map((item) => item.kind);
      expect(itemKinds).toContain('AsmOrg');
      expect(itemKinds).toContain('AsmRawData');
    });
  });
});
