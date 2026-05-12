import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import type { AsmItemNode, OpDeclNode, SourceSpan } from '../../src/frontend/ast.js';
import { createOpExpansionExecutionHelpers } from '../../src/lowering/opExpansionExecution.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

describe('#510 op expansion execution helpers', () => {
  it('keeps label mapping and lowering handoff stable', () => {
    const diagnostics: Diagnostic[] = [];
    let hiddenCounter = 0;
    let loweredItems: readonly AsmItemNode[] = [];

    const opDecl: OpDeclNode = {
      kind: 'OpDecl',
      span,
      name: 'my_op',
      params: [],
      stackPolicy: 'default',
      body: {
        kind: 'AsmBlock',
        span,
        items: [
          { kind: 'AsmLabel', span, name: 'loop' },
          {
            kind: 'AsmInstruction',
            span,
            head: 'jp',
            operands: [{ kind: 'Imm', span, expr: { kind: 'ImmName', span, name: 'loop' } }],
          },
          { kind: 'Case', span, value: { kind: 'ImmName', span, name: 'loop' } },
          { kind: 'If', span, cc: 'cond' },
        ],
      },
    } as unknown as OpDeclNode;

    const helpers = createOpExpansionExecutionHelpers({
      diagnostics,
      diagAt: (list, sourceSpan, message) => {
        list.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          file: sourceSpan.file,
          message,
        });
      },
      newHiddenLabel: (prefix) => `${prefix}_${hiddenCounter++}`,
      lowerAsmRange: (items) => {
        loweredItems = items;
        return items.length;
      },
    });

    helpers.expandAndLowerOpBody({
      opDecl,
      substituteOperandWithOpLabels: (operand, localLabelMap) =>
        operand.kind === 'Imm' && operand.expr.kind === 'ImmName'
          ? {
              ...operand,
              expr: {
                ...operand.expr,
                name: localLabelMap.get(operand.expr.name.toLowerCase()) ?? operand.expr.name,
              },
            }
          : operand,
      substituteImmWithOpLabels: (expr, localLabelMap) =>
        expr.kind === 'ImmName'
          ? { ...expr, name: localLabelMap.get(expr.name.toLowerCase()) ?? expr.name }
          : expr,
      substituteConditionWithOpLabels: (condition) => (condition === 'cond' ? 'NZ' : condition),
    });

    expect(diagnostics).toEqual([]);
    expect(loweredItems).toHaveLength(4);
    expect(loweredItems[0]).toMatchObject({ kind: 'AsmLabel', name: '__zax_op_my_op_lbl_0' });
    expect(loweredItems[1]).toMatchObject({
      kind: 'AsmInstruction',
      operands: [{ kind: 'Imm', expr: { kind: 'ImmName', name: '__zax_op_my_op_lbl_0' } }],
    });
    expect(loweredItems[2]).toMatchObject({
      kind: 'Case',
      value: { kind: 'ImmName', name: '__zax_op_my_op_lbl_0' },
    });
    expect(loweredItems[3]).toMatchObject({ kind: 'If', cc: 'NZ' });
  });
});
