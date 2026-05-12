import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR713 packed top-level array emission', () => {
  it('does not round top-level array initializers up before following symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr713_packed_top_level_arrays.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();

    const symbols = d8m!.json.symbols as Array<{ name: string; address: number }>;
    expect(symbols.find((s) => s.name === 'bytes')?.address).toBe(0x4000);
    expect(symbols.find((s) => s.name === 'flag')?.address).toBe(0x4003);
    expect(symbols.find((s) => s.name === 'words')?.address).toBe(0x4005);
    expect(symbols.find((s) => s.name === 'tail')?.address).toBe(0x4009);
  });
});
