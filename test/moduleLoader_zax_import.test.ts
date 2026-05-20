import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadProgram } from '../src/api-tooling.js';

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('ZAX compatibility imports', () => {
  it('keeps ZAX import loading and graph edges intact', async () => {
    await withTempDir('zax-import-compat-', async (dir) => {
      const entry = join(dir, 'main.zax');
      const lib = join(dir, 'lib.zax');
      await writeFile(entry, ['import "lib.zax"', 'const ROOT = lib.VALUE', ''].join('\n'), 'utf8');
      await writeFile(lib, ['export const VALUE = 7', ''].join('\n'), 'utf8');

      const res = await loadProgram({ entryFile: entry, sourceMode: 'zax' });

      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(res.loadedProgram?.resolvedImportGraph.get(entry)).toEqual([lib]);
      expect(res.loadedProgram?.moduleTraversal).toEqual([entry, lib]);
    });
  });
});
