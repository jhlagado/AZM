import { describe, expect, it } from 'vitest';

import {
  cloneEaExpr,
  cloneImmExpr,
  cloneOperand,
  createAsmUtilityHelpers,
  flattenEaDottedName,
} from '../../src/lowering/asmUtils.js';
import type { AsmOperandNode, EaExprNode, ImmExprNode, SourceSpan } from '../../src/frontend/ast.js';

const span: SourceSpan = {
  file: 'fixture.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('PR530 asm utility helpers', () => {
  it('clones immediate, ea, and operand nodes deeply', () => {
    const imm: ImmExprNode = {
      kind: 'ImmBinary',
      span,
      op: '+',
      left: { kind: 'ImmName', span, name: 'lhs' },
      right: { kind: 'ImmLiteral', span, value: 4 },
    };
    const ea: EaExprNode = {
      kind: 'EaAdd',
      span,
      base: {
        kind: 'EaIndex',
        span,
        base: { kind: 'EaField', span, base: { kind: 'EaName', span, name: 'obj' }, field: 'arr' },
        index: { kind: 'IndexImm', span, value: imm },
      },
      offset: { kind: 'ImmLiteral', span, value: 2 },
    };
    const operand: AsmOperandNode = { kind: 'Mem', span, expr: ea };

    const clonedImm = cloneImmExpr(imm);
    const clonedEa = cloneEaExpr(ea);
    const clonedOperand = cloneOperand(operand);

    expect(clonedImm).toEqual(imm);
    expect(clonedImm).not.toBe(imm);
    expect(clonedEa).toEqual(ea);
    expect(clonedEa).not.toBe(ea);
    expect(clonedOperand).toEqual(operand);
    expect(clonedOperand).not.toBe(operand);
    expect((clonedOperand as Extract<AsmOperandNode, { kind: 'Mem' }>).expr).not.toBe(ea);
  });

  it('keeps asm utility token normalization stable', () => {
    const { normalizeFixedToken } = createAsmUtilityHelpers({
      isEnumName: (name) => name === 'Mode.Fast',
    });

    expect(
      flattenEaDottedName({
        kind: 'EaField',
        span,
        base: { kind: 'EaName', span, name: 'Mode' },
        field: 'Fast',
      }),
    ).toBe('Mode.Fast');

    expect(normalizeFixedToken({ kind: 'Reg', span, name: 'ixh' })).toBe('IXH');
    expect(
      normalizeFixedToken({
        kind: 'Imm',
        span,
        expr: { kind: 'ImmName', span, name: 'nz' },
      }),
    ).toBe('NZ');
    expect(
      normalizeFixedToken({
        kind: 'Ea',
        span,
        expr: {
          kind: 'EaField',
          span,
          base: { kind: 'EaName', span, name: 'Mode' },
          field: 'Fast',
        },
      }),
    ).toBe('MODE.FAST');
  });
});
