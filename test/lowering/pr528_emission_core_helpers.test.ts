import { describe, expect, it } from 'vitest';

import type { AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { createEmissionCoreHelpers } from '../../src/lowering/emissionCore.js';
import type { StepPipeline } from '../../src/lowering/steps.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

describe('#528 emission core helpers', () => {
  it('keeps raw byte emission and step-pipeline execution stable', () => {
    let codeOffset = 0;
    const bytes = new Map<number, number>();
    const ranges: Array<[number, number]> = [];
    const traces: Array<{ start: number; bytes: number[]; text: string }> = [];
    const emittedInstrs: Array<{ head: string; operands: AsmOperandNode[] }> = [];
    const fixups: string[] = [];

    const { emitRawCodeBytes, emitStepPipeline } = createEmissionCoreHelpers({
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
      emitInstr: (head, operands) => {
        emittedInstrs.push({ head, operands });
        return true;
      },
      loadImm16ToDE: () => {
        emittedInstrs.push({ head: 'ldImm16ToDE', operands: [] });
        return true;
      },
      loadImm16ToHL: () => {
        emittedInstrs.push({ head: 'ldImm16ToHL', operands: [] });
        return true;
      },
      emitAbs16Fixup: (_opcode, _baseLower, _addend, _span, asmText) => {
        fixups.push(asmText ?? '');
      },
      emitAbs16FixupEd: (_opcode2, _baseLower, _addend, _span, asmText) => {
        fixups.push(asmText ?? '');
      },
    });

    emitRawCodeBytes(Uint8Array.of(0x3e, 0x12), span.file, 'ld a, $12');
    const pipe: StepPipeline = [
      { kind: 'push', reg: 'HL' },
      { kind: 'ldRpGlob', rp: 'HL', glob: 'glob_w' },
      { kind: 'ldRegReg', dst: 'A', src: 'B' },
    ];
    expect(emitStepPipeline(pipe, span)).toBe(true);

    expect(codeOffset).toBe(2);
    expect(Array.from(bytes.entries())).toEqual([
      [0, 0x3e],
      [1, 0x12],
    ]);
    expect(ranges).toEqual([[0, 2]]);
    expect(traces).toEqual([{ start: 0, bytes: [0x3e, 0x12], text: 'ld a, $12' }]);
    expect(emittedInstrs.map((entry) => entry.head)).toEqual(['push', 'ld']);
    expect(fixups).toEqual(['ld hl, glob_w']);
  });
});
