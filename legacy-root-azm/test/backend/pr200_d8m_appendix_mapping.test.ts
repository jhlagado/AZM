import { describe, expect, it } from 'vitest';

import { compileBackendFixtureToD8m } from './d8mTestHelpers.js';

type D8mFileEntry = {
  segments?: Array<{
    start: number;
    end: number;
    lstLine: number;
    kind: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
  }>;
  symbols?: Array<{
    name: string;
    kind: string;
    address?: number;
    value?: number;
    line?: number;
    scope?: 'global' | 'local';
  }>;
};

describe('PR200 D8M appendix mapping closure', () => {
  it('emits files-object grouped symbols/segments with deterministic baseline metadata', async () => {
    const d8m = await compileBackendFixtureToD8m('pr200_d8m_appendix_mapping.asm');
    const json = d8m.json as unknown as {
      format: string;
      version: number;
      arch: string;
      addressWidth: number;
      endianness: string;
      files: Record<string, D8mFileEntry>;
      fileList?: string[];
      symbols: Array<{ name: string; kind: string; value?: number; address?: number }>;
    };

    expect(json.format).toBe('d8-debug-map');
    expect(json.version).toBe(1);
    expect(json.arch).toBe('z80');
    expect(json.addressWidth).toBe(16);
    expect(json.endianness).toBe('little');
    expect(json.fileList).toEqual(['pr200_d8m_appendix_mapping.asm']);

    const fileEntry = json.files['pr200_d8m_appendix_mapping.asm'];
    if (!fileEntry) throw new Error('Expected per-file D8M entry for fixture source');
    expect(fileEntry.segments?.length).toBeGreaterThan(0);
    expect(fileEntry.segments?.some((segment) => segment.lstLine > 0)).toBe(true);

    const fileSymbols = fileEntry.symbols ?? [];
    expect(
      fileSymbols.some((s) => s.name === 'main' && s.kind === 'label' && s.scope === 'global'),
    ).toBe(true);

    const byName = new Map(json.symbols.map((s) => [s.name, s]));
    expect(byName.get('Big')).toMatchObject({
      kind: 'constant',
      value: 70000,
    });
  });
});
