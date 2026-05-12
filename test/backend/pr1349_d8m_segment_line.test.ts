import { describe, expect, it } from 'vitest';

import { writeD8m } from '../../src/formats/writeD8m.js';
import type { EmittedByteMap, SymbolEntry } from '../../src/formats/types.js';

describe('PR1349 D8M segment line (canonical source line)', () => {
  it('emits line on source-attributed file segments (1-based, matches lstLine)', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([
        [0x0100, 0x00],
        [0x0101, 0x00],
      ]),
      sourceSegments: [
        {
          start: 0x0100,
          end: 0x0102,
          file: 'sample.zax',
          line: 42,
          column: 1,
          kind: 'code',
          confidence: 'high',
        },
      ],
    };
    const artifact = writeD8m(map, []);
    const files = artifact.json.files as Record<
      string,
      { segments?: Array<Record<string, unknown>> }
    >;
    const segs = files['sample.zax']?.segments ?? [];
    const code = segs.find((s) => s.kind === 'code');
    expect(code).toBeDefined();
    expect(code?.line).toBe(42);
    expect(code?.lstLine).toBe(42);
    expect(code?.start).toBe(0x0100);
    expect(code?.end).toBe(0x0102);
    expect(code?.confidence).toBe('high');
  });

  it('omits line and keeps lstLine valid on synthetic low-confidence segments', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([[0x0200, 0xc9]]),
    };
    const symbols: SymbolEntry[] = [
      { kind: 'label', name: 'only', address: 0x0200, file: 'main.zax', scope: 'global' },
    ];
    const artifact = writeD8m(map, symbols);
    const files = artifact.json.files as Record<
      string,
      { segments?: Array<Record<string, unknown>> }
    >;
    const segs = files['main.zax']?.segments ?? [];
    const low = segs.find((s) => s.kind === 'unknown' && s.confidence === 'low');
    expect(low).toBeDefined();
    expect(low).not.toHaveProperty('line');
    expect(low?.lstLine).toBe(1);
  });

  it('does not emit overlapping synthetic file segments when source-attributed segments already exist', () => {
    const map: EmittedByteMap = {
      bytes: new Map<number, number>([
        [0x0100, 0x00],
        [0x0101, 0x00],
      ]),
      sourceSegments: [
        {
          start: 0x0100,
          end: 0x0102,
          file: 'sample.zax',
          line: 42,
          column: 1,
          kind: 'code',
          confidence: 'high',
        },
      ],
    };
    const symbols: SymbolEntry[] = [
      { kind: 'label', name: 'sample', address: 0x0100, file: 'sample.zax', scope: 'global' },
    ];
    const artifact = writeD8m(map, symbols);
    const files = artifact.json.files as Record<
      string,
      { segments?: Array<Record<string, unknown>> }
    >;
    const segs = files['sample.zax']?.segments ?? [];
    expect(segs.some((s) => s.kind === 'unknown' && s.confidence === 'low')).toBe(false);
  });
});
