import { describe, expect, it } from 'vitest';

import { createFixupEmissionHelpers } from '../../src/lowering/fixupEmission.js';

describe('PR529 fixup emission helpers', () => {
  it('emits abs16 and rel8 fixups with the current trace shape', () => {
    let codeOffset = 0;
    const bytes = new Map<number, number>();
    const fixups: Array<{ offset: number; baseLower: string; addend: number; file: string }> = [];
    const rel8Fixups: Array<{
      offset: number;
      origin: number;
      baseLower: string;
      addend: number;
      file: string;
      mnemonic: string;
    }> = [];
    const traces: Array<{ start: number; bytes: number[]; asmText: string }> = [];
    const ranges: Array<[number, number]> = [];

    const helpers = createFixupEmissionHelpers({
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
      pushFixup: (fixup) => {
        fixups.push(fixup);
      },
      pushRel8Fixup: (fixup) => {
        rel8Fixups.push(fixup);
      },
      traceInstruction: (start, emitted, asmText) => {
        traces.push({ start, bytes: [...emitted], asmText });
      },
      evalImmExpr: (expr) => {
        if (expr.kind === 'ImmLiteral') return expr.value;
        return undefined;
      },
    });

    const span = {
      file: 'fixture.zax',
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    };

    helpers.emitAbs16Fixup(0x21, 'glob_w', 2, span);
    helpers.emitRel8Fixup(0x18, 'loop', -1, span, 'jr');

    expect(codeOffset).toBe(5);
    expect([...bytes.entries()]).toEqual([
      [0, 0x21],
      [1, 0x00],
      [2, 0x00],
      [3, 0x18],
      [4, 0x00],
    ]);
    expect(fixups).toEqual([{ offset: 1, baseLower: 'glob_w', addend: 2, file: 'fixture.zax' }]);
    expect(rel8Fixups).toEqual([
      {
        offset: 4,
        origin: 5,
        baseLower: 'loop',
        addend: -1,
        file: 'fixture.zax',
        mnemonic: 'jr',
      },
    ]);
    expect(ranges).toEqual([
      [0, 3],
      [3, 5],
    ]);
    expect(traces).toEqual([
      { start: 0, bytes: [0x21, 0x00, 0x00], asmText: 'ld HL, glob_w + 2' },
      { start: 3, bytes: [0x18, 0x00], asmText: 'jr loop' },
    ]);
  });

  it('keeps condition helpers and symbolic targets stable', () => {
    const helpers = createFixupEmissionHelpers({
      getCodeOffset: () => 0,
      setCodeOffset: () => {},
      setCodeByte: () => {},
      recordCodeSourceRange: () => {},
      pushFixup: () => {},
      pushRel8Fixup: () => {},
      traceInstruction: () => {},
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
    });

    expect(helpers.conditionOpcodeFromName('nz')).toBe(0xc2);
    expect(helpers.conditionNameFromOpcode(0xfa)).toBe('M');
    expect(helpers.callConditionOpcodeFromName('c')).toBe(0xdc);
    expect(helpers.jrConditionOpcodeFromName('z')).toBe(0x28);
    expect(helpers.inverseConditionName('po')).toBe('PE');
    expect(
      helpers.conditionOpcode({
        kind: 'Reg',
        span: {
          file: 'fixture.zax',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
        name: 'nz',
      }),
    ).toBe(0xc2);
    expect(
      helpers.symbolicTargetFromExpr({
        kind: 'ImmBinary',
        span: {
          file: 'fixture.zax',
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
        op: '+',
        left: {
          kind: 'ImmName',
          span: {
            file: 'fixture.zax',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
          name: 'target',
        },
        right: {
          kind: 'ImmLiteral',
          span: {
            file: 'fixture.zax',
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
          value: 4,
        },
      }),
    ).toEqual({ baseLower: 'target', addend: 4 });
  });
});
