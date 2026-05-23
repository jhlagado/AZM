import { describe, expect, it } from 'vitest';

import { backendFixturePath, compileBackendFixtureToD8m } from './d8mTestHelpers.js';

describe('PR119 D8M path normalization', () => {
  it('normalizes symbol file paths to project-relative with forward slashes', async () => {
    const d8m = await compileBackendFixtureToD8m('pr11_include_main.asm', {
      includeDirs: [backendFixturePath('includes')],
    });
    const d8mJson = d8m.json as unknown as {
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
    expect(Object.keys(d8mJson.files ?? {})).toEqual(['includes/lib.inc', 'pr11_include_main.asm']);
    expect(d8mJson.fileList).toEqual(['includes/lib.inc', 'pr11_include_main.asm']);
  });
});
