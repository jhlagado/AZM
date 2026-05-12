import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { D8mArtifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR119 D8M path normalization', () => {
  it('normalizes symbol file paths to project-relative with forward slashes', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr10_import_main.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();
    const d8mJson = d8m!.json as unknown as {
      symbols: Array<{ name: string; file?: string }>;
      files?: Record<string, unknown>;
      fileList?: string[];
    };
    const byName = new Map(d8mJson.symbols.map((s) => [s.name, s]));
    const main = byName.get('main_start');
    const lib = byName.get('lib_start');
    expect(main?.file).toBe('pr10_import_main.zax');
    expect(lib?.file).toBe('pr10_import_lib.zax');
    expect(main?.file?.includes('\\')).toBe(false);
    expect(lib?.file?.includes('\\')).toBe(false);
    expect(Object.keys(d8mJson.files ?? {})).toEqual([
      'pr10_import_lib.zax',
      'pr10_import_main.zax',
    ]);
    expect(d8mJson.fileList).toEqual(['pr10_import_lib.zax', 'pr10_import_main.zax']);
  });
});
