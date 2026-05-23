import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import { writeD8m } from '../../../src/outputs/write-d8.js';
import type { EmittedByteMap, SymbolEntry } from '../../../src/outputs/types.js';

describe('writeD8m', () => {
  it('splits sparse global segments and assigns them to matching source files', () => {
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

    const result = writeD8m(map, symbols);

    expect(result.json.segments).toEqual([
      { start: 0x1000, end: 0x1002 },
      { start: 0x2000, end: 0x2001 },
    ]);
    expect(result.json.files['lib.asm']?.segments).toMatchObject([{ start: 0x1000, end: 0x1002 }]);
    expect(result.json.files['main.asm']?.segments).toMatchObject([{ start: 0x2000, end: 0x2001 }]);
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

    const result = writeD8m(map, symbols);

    expect(result.json.symbols.map((symbol) => symbol.name)).toEqual([
      'a_first',
      'z_last',
      'ConstA',
      'ConstZ',
    ]);
    expect(result.json.files['main.asm']?.symbols?.map((symbol) => symbol.name)).toEqual([
      'a_first',
      'z_last',
      'ConstA',
      'ConstZ',
    ]);
  });

  it('falls back to the first sorted file when no addressed symbols claim a segment', () => {
    const map: EmittedByteMap = { bytes: new Map<number, number>([[0x3000, 0xaa]]) };
    const symbols: SymbolEntry[] = [
      { kind: 'constant', name: 'Zed', value: 7, file: 'z.asm' },
      { kind: 'constant', name: 'Able', value: 1, file: 'a.asm' },
    ];

    const result = writeD8m(map, symbols);

    expect(result.json.fileList).toEqual(['a.asm', 'z.asm']);
    expect(result.json.files['a.asm']?.segments).toMatchObject([{ start: 0x3000, end: 0x3001 }]);
    expect(result.json.files['z.asm']?.segments ?? []).toEqual([]);
  });

  it('preserves source-attributed per-file segments when provided', () => {
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
    ];

    const result = writeD8m(map, symbols, { rootDir: '/project' });

    expect(result.json.files['src/pacmo/pacmo.z80']?.segments).toMatchObject([
      {
        start: 0x1000,
        end: 0x1002,
        line: 12,
        lstLine: 12,
        kind: 'code',
        confidence: 'high',
      },
    ]);
  });

  it('uses legacy tie-breakers for same-address symbols and same-range segments', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([[0x1000, 0x00]]),
      sourceSegments: [
        {
          start: 0x1000,
          end: 0x1001,
          file: 'main.asm',
          line: 4,
          column: 1,
          kind: 'macro',
          confidence: 'medium',
        },
        {
          start: 0x1000,
          end: 0x1001,
          file: 'main.asm',
          line: 4,
          column: 1,
          kind: 'code',
          confidence: 'high',
        },
      ],
    };
    const symbols: SymbolEntry[] = [
      { kind: 'label', name: 'dup', address: 0x1000, file: 'b.asm', line: 2, scope: 'global' },
      { kind: 'label', name: 'dup', address: 0x1000, file: 'a.asm', line: 2, scope: 'global' },
    ];

    const result = writeD8m(map, symbols);

    expect(result.json.symbols.map((symbol) => symbol.file)).toEqual(['a.asm', 'b.asm']);
    expect(result.json.files['main.asm']?.segments?.map((segment) => segment.kind)).toEqual([
      'code',
      'macro',
    ]);
  });

  it('normalizes files outside rootDir to resolved absolute paths', () => {
    const result = writeD8m(
      { bytes: new Map<number, number>([[0x1000, 0x00]]) },
      [{ kind: 'label', name: 'outside', address: 0x1000, file: 'outside.asm' }],
      { rootDir: '/project', inputs: { entry: 'outside.asm' } },
    );
    const outsidePath = resolve('outside.asm').replace(/\\/g, '/');

    expect(result.json.fileList).toEqual([outsidePath]);
    expect(result.json.symbols[0]?.file).toBe(outsidePath);
    expect(result.json.generator.inputs?.entry).toBe(outsidePath);
  });

  it('omits generator inputs when all input paths are empty', () => {
    const result = writeD8m({ bytes: new Map<number, number>([[0x1000, 0x00]]) }, [], {
      inputs: { listing: '' },
    });

    expect(result.json.generator).not.toHaveProperty('inputs');
  });
});
