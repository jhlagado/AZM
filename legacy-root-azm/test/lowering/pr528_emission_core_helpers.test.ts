import { describe, expect, it } from 'vitest';

import { createEmissionCoreHelpers } from '../../src/lowering/emissionCore.js';
import type { SourceSpan } from '../../src/frontend/ast.js';

const span: SourceSpan = {
  file: 'test.asm',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

describe('#528 emission core helpers', () => {
  it('keeps raw byte emission stable', () => {
    let codeOffset = 0;
    const bytes = new Map<number, number>();
    const ranges: Array<[number, number]> = [];
    const traces: Array<{ start: number; bytes: number[]; text: string }> = [];

    const { emitRawCodeBytes } = createEmissionCoreHelpers({
      getCodeOffset: () => codeOffset,
      setCodeOffset: (value) => {
        codeOffset = value;
      },
      setCodeByte: (offset, value) => {
        bytes.set(offset, value);
      },
      recordCodeSourceRange: (start, end) => {
        ranges.push([start, end]);
      },
      traceInstruction: (start, bs, traceText) => {
        traces.push({ start, bytes: Array.from(bs), text: traceText });
      },
    });

    emitRawCodeBytes(Uint8Array.of(0x3e, 0x12), span.file, 'ld a, $12');

    expect(codeOffset).toBe(2);
    expect(Array.from(bytes.entries())).toEqual([
      [0, 0x3e],
      [1, 0x12],
    ]);
    expect(ranges).toEqual([[0, 2]]);
    expect(traces).toEqual([{ start: 0, bytes: [0x3e, 0x12], text: 'ld a, $12' }]);
  });
});
