import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, ImmExprNode, SourceSpan } from '../../src/frontend/ast.js';
import { createOpSubstitutionHelpers } from '../../src/lowering/opSubstitution.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

const cloneImmExpr = (expr: ImmExprNode): ImmExprNode => JSON.parse(JSON.stringify(expr));
const cloneEaExpr = (ea: EaExprNode): EaExprNode => JSON.parse(JSON.stringify(ea));
const cloneOperand = (operand: AsmOperandNode): AsmOperandNode => JSON.parse(JSON.stringify(operand));
const immName = (name: string): ImmExprNode => ({ kind: 'ImmName', span, name });
const immOperand = (name: string): AsmOperandNode => ({ kind: 'Imm', span, expr: immName(name) });
const regOperand = (name: string): AsmOperandNode => ({ kind: 'Reg', span, name });
const memOperand = (name: string): AsmOperandNode => ({
  kind: 'Mem',
  span,
  expr: { kind: 'EaName', span, name },
});

describe('#510 op substitution helpers', () => {
  it('keeps substitution behavior stable for bindings and local labels', () => {
    const diagnostics: Diagnostic[] = [];
    const bindings = new Map<string, AsmOperandNode>([
      ['arg', regOperand('B')],
      ['immarg', immOperand('ENUM_ONE')],
      ['cond', immOperand('NZ')],
    ]);
    const localLabelMap = new Map<string, string>([['loop', '__hidden_loop_0']]);

    const helpers = createOpSubstitutionHelpers({
      bindings,
      env: { enums: new Map([['ENUM_ONE', {} as never]]) } as never,
      diagnostics,
      diagAt: (list, sourceSpan, message) => {
        list.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          file: sourceSpan.file,
          message,
        });
      },
      cloneImmExpr,
      cloneEaExpr,
      cloneOperand,
      flattenEaDottedName: (ea) => (ea.kind === 'EaName' ? ea.name : undefined),
      normalizeFixedToken: (operand) =>
        operand.kind === 'Imm' && operand.expr.kind === 'ImmName' ? operand.expr.name.toUpperCase() : undefined,
      inverseConditionName: (name) =>
        ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'].includes(name) ? name : undefined,
    });

    expect(helpers.substituteOperand(immOperand('arg'))).toEqual(regOperand('B'));
    expect(helpers.substituteOperand(memOperand('arg'))).toEqual({
      kind: 'Mem',
      span,
      expr: { kind: 'EaName', span, name: 'B' },
    });
    expect(helpers.substituteImmWithOpLabels(immName('loop'), localLabelMap)).toEqual({
      kind: 'ImmName',
      span,
      name: '__hidden_loop_0',
    });
    expect(helpers.substituteConditionWithOpLabels('cond', span, 'my_op')).toBe('NZ');
    expect(diagnostics).toEqual([]);
  });
});
