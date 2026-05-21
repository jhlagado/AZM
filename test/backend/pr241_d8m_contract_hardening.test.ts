import { describe, expect, it } from 'vitest';

import { writeD8m } from '../../src/formats/writeD8m.js';
import type { EmittedByteMap, SymbolEntry } from '../../src/formats/types.js';

type D8mView = {
  segments: Array<{ start: number; end: number }>;
  symbols: Array<{ name: string; kind: string; address?: number; value?: number; file?: string }>;
  files: Record<string, { segments?: Array<{ start: number; end: number }>; symbols?: unknown[] }>;
  fileList?: string[];
  generator?: {
    name?: string;
    tool?: string;
    version?: string;
    inputs?: Record<string, string>;
    entryAddress?: number;
    entrySymbol?: string;
  };
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
      { kind: 'label', name: 'lib_start', address: 0x1000, file: 'lib.asm', scope: 'global' },
      { kind: 'label', name: 'main_start', address: 0x2000, file: 'main.asm', scope: 'global' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.segments).toEqual([
      { start: 0x1000, end: 0x1002 },
      { start: 0x2000, end: 0x2001 },
    ]);
    expect(json.files['lib.asm']?.segments).toMatchObject([{ start: 0x1000, end: 0x1002 }]);
    expect(json.files['main.asm']?.segments).toMatchObject([{ start: 0x2000, end: 0x2001 }]);
  });

  it('sorts symbols deterministically by address/name and constants after addressed symbols', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([
        [0x2000, 0xc9],
        [0x1000, 0x00],
      ]),
    };
    const symbols: SymbolEntry[] = [
      { kind: 'constant', name: 'ConstZ', value: 9, file: 'main.asm' },
      { kind: 'label', name: 'z_last', address: 0x2000, file: 'main.asm', scope: 'global' },
      { kind: 'label', name: 'a_first', address: 0x1000, file: 'main.asm', scope: 'global' },
      { kind: 'constant', name: 'ConstA', value: 1, file: 'main.asm' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.symbols.map((s) => s.name)).toEqual(['a_first', 'z_last', 'ConstA', 'ConstZ']);
    expect(json.symbols.map((s) => s.kind)).toEqual(['label', 'label', 'constant', 'constant']);
    expect(json.files['main.asm']?.symbols?.map((s) => (s as { name: string }).name)).toEqual([
      'a_first',
      'z_last',
      'ConstA',
      'ConstZ',
    ]);
  });

  it('falls back to first sorted file when no addressed symbols can claim segment ownership', () => {
    const map: EmittedByteMap = { bytes: new Map<number, number>([[0x3000, 0xaa]]) };
    const symbols: SymbolEntry[] = [
      { kind: 'constant', name: 'Zed', value: 7, file: 'z.asm' },
      { kind: 'constant', name: 'Able', value: 1, file: 'a.asm' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.fileList).toEqual(['a.asm', 'z.asm']);
    expect(json.files['a.asm']?.segments).toMatchObject([{ start: 0x3000, end: 0x3001 }]);
    expect(json.files['z.asm']?.segments ?? []).toEqual([]);
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
      { kind: 'label', name: 'lib_a', address: 0x1000, file: 'lib.asm', scope: 'global' },
      { kind: 'label', name: 'main_a', address: 0x2000, file: 'main.asm', scope: 'global' },
      { kind: 'label', name: 'lib_b', address: 0x4000, file: 'lib.asm', scope: 'global' },
    ];

    const artifact = writeD8m(map, symbols);
    const json = artifact.json as unknown as D8mView;

    expect(json.segments).toEqual([
      { start: 0x1000, end: 0x1001 },
      { start: 0x2000, end: 0x2001 },
      { start: 0x4000, end: 0x4001 },
    ]);
    expect(json.files['lib.asm']?.segments).toMatchObject([
      { start: 0x1000, end: 0x1001 },
      { start: 0x4000, end: 0x4001 },
    ]);
    expect(json.files['main.asm']?.segments).toMatchObject([{ start: 0x2000, end: 0x2001 }]);
  });

  it('emits explicit AZM generator metadata and preserves value-only constants', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([
        [0x1000, 0x00],
        [0x1001, 0xc9],
      ]),
      sourceSegments: [
        {
          start: 0x1000,
          end: 0x1002,
          file: '/project/src/pacmo/pacmo.z80',
          line: 12,
          column: 1,
          kind: 'code',
          confidence: 'high',
        },
      ],
    };
    const symbols: SymbolEntry[] = [
      {
        kind: 'label',
        name: 'main',
        address: 0x1000,
        file: '/project/src/pacmo/pacmo.z80',
        line: 12,
        scope: 'global',
      },
      {
        kind: 'constant',
        name: 'ColorRed',
        value: 1,
        file: '/project/src/shared/constants.asm',
        line: 3,
        scope: 'global',
      },
    ];

    const artifact = writeD8m(map, symbols, {
      rootDir: '/project',
      packageVersion: '0.1.1-test',
      entrySymbol: 'main',
      entryAddress: 0x1000,
      inputs: {
        entry: '/project/src/pacmo/pacmo.z80',
        listing: '/project/build/pacmo.lst',
        hex: '/project/build/pacmo.hex',
      },
    });
    const json = artifact.json as unknown as D8mView;

    expect(json.generator).toMatchObject({
      name: 'azm',
      tool: 'azm',
      version: '0.1.1-test',
      entrySymbol: 'main',
      entryAddress: 0x1000,
      inputs: {
        entry: 'src/pacmo/pacmo.z80',
        listing: 'build/pacmo.lst',
        hex: 'build/pacmo.hex',
      },
    });
    expect(Object.keys(json.files)).toEqual(['src/pacmo/pacmo.z80', 'src/shared/constants.asm']);
    expect(json.files['src/pacmo/pacmo.z80']?.segments).toMatchObject([
      { start: 0x1000, end: 0x1002, line: 12, lstLine: 12, confidence: 'high' },
    ]);

    const constant = json.symbols.find((symbol) => symbol.name === 'ColorRed');
    expect(constant).toMatchObject({
      kind: 'constant',
      value: 1,
      file: 'src/shared/constants.asm',
    });
    expect(constant).not.toHaveProperty('address');
    expect(json.symbols.find((symbol) => symbol.name === 'main')).toMatchObject({
      kind: 'label',
      address: 0x1000,
      file: 'src/pacmo/pacmo.z80',
    });
  });
});
