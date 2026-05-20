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
    const entry = join(__dirname, '..', 'fixtures', 'pr11_include_main.asm');
    const res = await compile(
      entry,
      { includeDirs: [join(__dirname, '..', 'fixtures', 'includes')] },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();
    const d8mJson = d8m!.json as unknown as {
      symbols: Array<{ name: string; file?: string }>;
      files?: Record<string, unknown>;
      fileList?: string[];
    };
    const byName = new Map(d8mJson.symbols.map((s) => [s.name, s]));
    const main = byName.get('main');
    const helper = byName.get('helper');
    expect(main?.file).toBe('pr11_include_main.asm');
    expect(helper?.file).toBe('includes/lib.inc');
    expect(main?.file?.includes('\\')).toBe(false);
    expect(helper?.file?.includes('\\')).toBe(false);
    expect(Object.keys(d8mJson.files ?? {})).toEqual([
      'includes/lib.inc',
      'pr11_include_main.asm',
    ]);
    expect(d8mJson.fileList).toEqual(['includes/lib.inc', 'pr11_include_main.asm']);
  });
});
