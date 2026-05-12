import { describe, expect, it } from 'vitest';

import type { EmittedSourceSegment } from '../src/formats/types.js';
import {
  alignTo,
  computeWrittenRange,
  rebaseCodeSourceSegments,
  writeSection,
} from '../src/lowering/sectionLayout.js';

describe('PR474: section layout helpers', () => {
  it('aligns offsets and computes written ranges deterministically', () => {
    expect(alignTo(3, 2)).toBe(4);
    expect(alignTo(4, 2)).toBe(4);
    expect(alignTo(5, 0)).toBe(5);

    const bytes = new Map<number, number>([
      [0x10, 0xaa],
      [0x12, 0xbb],
    ]);
    expect(computeWrittenRange(bytes)).toEqual({ start: 0x10, end: 0x13 });
    expect(computeWrittenRange(new Map())).toEqual({ start: 0, end: 0 });
  });

  it('writes sections with overlap and range diagnostics', () => {
    const bytes = new Map<number, number>([[0x20, 0xff]]);
    const diagnostics: string[] = [];

    writeSection(
      0x20,
      new Map<number, number>([
        [0, 0xaa],
        [1, 0xbb],
      ]),
      bytes,
      (message) => diagnostics.push(message),
    );

    expect(bytes.get(0x20)).toBe(0xff);
    expect(bytes.get(0x21)).toBe(0xbb);
    expect(diagnostics).toEqual(['Byte overlap at address 32.']);
  });

  it('rebases source segments with range filtering', () => {
    const segments: EmittedSourceSegment[] = [
      {
        start: 0,
        end: 2,
        file: 'a.zax',
        line: 1,
        column: 1,
        kind: 'code',
        confidence: 'high',
      },
      {
        start: -0x300,
        end: -0x2ff,
        file: 'b.zax',
        line: 2,
        column: 1,
        kind: 'code',
        confidence: 'low',
      },
    ];

    expect(rebaseCodeSourceSegments(0x100, segments)).toEqual([
      {
        ...segments[0]!,
        start: 0x100,
        end: 0x102,
      },
    ]);
  });
});
