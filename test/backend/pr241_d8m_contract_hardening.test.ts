import { describe, expect, it } from 'vitest';

import { writeD8m } from '../../src/formats/writeD8m.js';
import type { EmittedByteMap, SymbolEntry } from '../../src/formats/types.js';

type D8mView = {
  segments: Array<{ start: number; end: number }>;
  symbols: Array<{ name: string; kind: string; address?: number; value?: number }>;
  files: Record<string, { segments?: Array<{ start: number; end: number }>; symbols?: unknown[] }>;
  fileList?: string[];
};

describe('PR241 D8M contract hardening', () => {
  it('assigns sparse segments to matching source files using symbol address ranges', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([
        [0x1000, 0x3e],
        [0x1001, 0x01],
        [0x2000, 0xc9],
      ]),
    };
    const symbols: SymbolEntry[] = [
      { kind: 'label', name: 'lib_start', address: 0x1000, file: 'lib.zax', scope: 'global' },
      { kind: 'label', name: 'main_start', address: 0x2000, file: 'main.zax', scope: 'global' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.segments).toEqual([
      { start: 0x1000, end: 0x1002 },
      { start: 0x2000, end: 0x2001 },
    ]);
    expect(json.files['lib.zax']?.segments).toMatchObject([{ start: 0x1000, end: 0x1002 }]);
    expect(json.files['main.zax']?.segments).toMatchObject([{ start: 0x2000, end: 0x2001 }]);
  });

  it('sorts symbols deterministically by address/name and constants after addressed symbols', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([
        [0x2000, 0xc9],
        [0x1000, 0x00],
      ]),
    };
    const symbols: SymbolEntry[] = [
      { kind: 'constant', name: 'ConstZ', value: 9, file: 'main.zax' },
      { kind: 'label', name: 'z_last', address: 0x2000, file: 'main.zax', scope: 'global' },
      { kind: 'label', name: 'a_first', address: 0x1000, file: 'main.zax', scope: 'global' },
      { kind: 'constant', name: 'ConstA', value: 1, file: 'main.zax' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.symbols.map((s) => s.name)).toEqual(['a_first', 'z_last', 'ConstA', 'ConstZ']);
    expect(json.symbols.map((s) => s.kind)).toEqual(['label', 'label', 'constant', 'constant']);
    expect(json.files['main.zax']?.symbols?.map((s) => (s as { name: string }).name)).toEqual([
      'a_first',
      'z_last',
      'ConstA',
      'ConstZ',
    ]);
  });

  it('falls back to first sorted file when no addressed symbols can claim segment ownership', () => {
    const map: EmittedByteMap = { bytes: new Map<number, number>([[0x3000, 0xaa]]) };
    const symbols: SymbolEntry[] = [
      { kind: 'constant', name: 'Zed', value: 7, file: 'z.zax' },
      { kind: 'constant', name: 'Able', value: 1, file: 'a.zax' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.fileList).toEqual(['a.zax', 'z.zax']);
    expect(json.files['a.zax']?.segments).toMatchObject([{ start: 0x3000, end: 0x3001 }]);
    expect(json.files['z.zax']?.segments ?? []).toEqual([]);
  });

  it('does not over-claim disjoint symbol regions for the same file', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([
        [0x1000, 0xaa],
        [0x2000, 0xbb],
        [0x4000, 0xcc],
      ]),
    };
    const symbols: SymbolEntry[] = [
      { kind: 'label', name: 'lib_a', address: 0x1000, file: 'lib.zax', scope: 'global' },
      { kind: 'label', name: 'main_a', address: 0x2000, file: 'main.zax', scope: 'global' },
      { kind: 'label', name: 'lib_b', address: 0x4000, file: 'lib.zax', scope: 'global' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.segments).toEqual([
      { start: 0x1000, end: 0x1001 },
      { start: 0x2000, end: 0x2001 },
      { start: 0x4000, end: 0x4001 },
    ]);
    expect(json.files['lib.zax']?.segments).toMatchObject([
      { start: 0x1000, end: 0x1001 },
      { start: 0x4000, end: 0x4001 },
    ]);
    expect(json.files['main.zax']?.segments).toMatchObject([{ start: 0x2000, end: 0x2001 }]);
  });
});
