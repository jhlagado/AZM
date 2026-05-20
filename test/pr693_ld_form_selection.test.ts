import { describe, expect, it } from 'vitest';

import type { AsmInstructionNode, EaExprNode, ImmExprNode, SourceSpan, TypeExprNode } from '../src/frontend/ast.js';
import { createLdFormSelectionHelpers } from '../src/lowering/ldFormSelection.js';
import type { EaResolution } from '../src/lowering/eaResolution.js';
import type { CompileEnv } from '../src/semantics/env.js';

const span: SourceSpan = {
  file: 'pr693.asm',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function immName(name: string): ImmExprNode {
  return { kind: 'ImmName', span, name };
}

function eaName(name: string): EaExprNode {
  return { kind: 'EaName', span, name };
}

function makeEnv(): CompileEnv {
  return {
    equates: new Map(),
    enums: new Map(),
    types: new Map(),
  };
}

function makeSelectionContext() {
  const byteType: TypeExprNode = { kind: 'TypeName', span, name: 'byte' };
  const wordType: TypeExprNode = { kind: 'TypeName', span, name: 'word' };
  const resolutionByName = new Map<string, EaResolution>([
    ['glob_b', { kind: 'abs', baseLower: 'glob_b', addend: 0, typeExpr: byteType }],
    ['src_b', { kind: 'abs', baseLower: 'src_b', addend: 0, typeExpr: byteType }],
    ['dst_b', { kind: 'abs', baseLower: 'dst_b', addend: 0, typeExpr: byteType }],
    ['src_w', { kind: 'abs', baseLower: 'src_w', addend: 0, typeExpr: wordType }],
    ['dst_w', { kind: 'abs', baseLower: 'dst_w', addend: 0, typeExpr: wordType }],
  ]);

  return {
    env: makeEnv(),
    resolveEa: (ea: EaExprNode): EaResolution | undefined => {
      if (ea.kind === 'EaName') return resolutionByName.get(ea.name.toLowerCase());
      return undefined;
    },
  };
}

describe('PR693 ld form selection', () => {
  it('leaves bare symbols as immediate operands', () => {
    const { analyzeLdInstruction } = createLdFormSelectionHelpers(makeSelectionContext());
    const inst: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'ld',
      operands: [
        { kind: 'Reg', span, name: 'A' },
        { kind: 'Imm', span, expr: immName('glob_b') },
      ],
    };

    const form = analyzeLdInstruction(inst);
    expect(form).not.toBeNull();
    expect(form?.src).toMatchObject({ kind: 'Imm', expr: { kind: 'ImmName', name: 'glob_b' } });
    expect(form?.srcResolved).toBeUndefined();
  });

  it('marks ix/iy displacement memory forms for native-encoder fallback', () => {
    const { analyzeLdInstruction } = createLdFormSelectionHelpers(makeSelectionContext());
    const inst: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'ld',
      operands: [
        {
          kind: 'Mem',
          span,
          expr: {
            kind: 'EaAdd',
            span,
            base: eaName('IX'),
            offset: { kind: 'ImmLiteral', span, value: 2 },
          },
        },
        { kind: 'Reg', span, name: 'A' },
      ],
    };

    const form = analyzeLdInstruction(inst);
    expect(form).not.toBeNull();
    expect(form?.dstIsIxIyDispMem).toBe(true);
    expect(form?.dstHasRegisterLikeEaBase).toBe(true);
  });

  it('does not promote typed memory-to-memory copies into pseudo ld forms', () => {
    const { analyzeLdInstruction } = createLdFormSelectionHelpers(makeSelectionContext());
    const inst: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'ld',
      operands: [
        { kind: 'Mem', span, expr: eaName('dst_w') },
        { kind: 'Mem', span, expr: eaName('src_w') },
      ],
    };

    const form = analyzeLdInstruction(inst);
    expect(form).not.toBeNull();
    expect(form?.dstResolved).toMatchObject({ baseLower: 'dst_w' });
    expect(form?.srcResolved).toMatchObject({ baseLower: 'src_w' });
  });
});
