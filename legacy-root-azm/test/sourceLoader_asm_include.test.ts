import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { loadProgram } from '../src/api-tooling.js';

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('assembler textual includes', () => {
  it('expands canonical .include text independent of the included file extension', async () => {
    await withTempDir('azm-asm-include-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const child = join(dir, 'child.z80');
      await writeFile(
        entry,
        ['.org $4000', '.include "child.z80"', 'main:', '  ld a,VALUE', '  ret', ''].join('\n'),
        'utf8',
      );
      await writeFile(child, ['VALUE EQU $2a', ''].join('\n'), 'utf8');

      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toEqual([0x3e, 0x2a, 0xc9]);
    });
  });

  it('applies directive aliases inside included files through the public loader', async () => {
    await withTempDir('azm-asm-include-alias-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const child = join(dir, 'data.asm');
      await writeFile(entry, ['.include "data.asm"', ''].join('\n'), 'utf8');
      await writeFile(child, ['DATA: DB $01', 'SPACE: DS 2', ''].join('\n'), 'utf8');

      const res = await loadProgram({ entryFile: entry });

      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(res.loadedProgram?.program.files).toHaveLength(1);
      const itemKinds = res.loadedProgram?.program.files[0]?.items.map((item) => item.kind);
      expect(itemKinds).toContain('AsmRawData');
    });
  });

  it('makes ops declared in included ASM text visible to the including source', async () => {
    await withTempDir('azm-asm-include-op-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const ops = join(dir, 'ops.inc');
      await writeFile(
        entry,
        ['.include "ops.inc"', 'main:', '  clear_a', '  ret', ''].join('\n'),
        'utf8',
      );
      await writeFile(ops, ['op clear_a()', '  xor a', 'end', ''].join('\n'), 'utf8');

      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toEqual([0xaf, 0xc9]);
    });
  });
});
