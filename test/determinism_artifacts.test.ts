import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { artifactSnapshot } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function compileSnapshot(entry: string): Promise<Array<{ kind: string; data: string }>> {
  const res = await compile(entry, {}, { formats: defaultFormatWriters });
  expect(res.diagnostics).toEqual([]);
  return res.artifacts.map(artifactSnapshot);
}

describe('determinism', () => {
  it('produces identical artifacts across repeated compiles (single module)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr603_determinism_single_module.zax');
    const snap0 = await compileSnapshot(entry);
    for (let i = 0; i < 5; i++) {
      expect(await compileSnapshot(entry)).toEqual(snap0);
    }
  });

  it('produces identical artifacts across repeated compiles (imports + packing)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr10_import_main.zax');
    const snap0 = await compileSnapshot(entry);
    for (let i = 0; i < 5; i++) {
      expect(await compileSnapshot(entry)).toEqual(snap0);
    }
  });
});
