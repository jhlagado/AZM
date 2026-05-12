import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, OpDeclNode, SourceSpan } from '../../src/frontend/ast.js';
import { createOpExpansionOrchestrationHelpers } from '../../src/lowering/opExpansionOrchestration.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

describe('#510 op expansion orchestration helpers', () => {
  it('keeps arity-mismatch routing stable', () => {
    const diagnostics: Diagnostic[] = [];
    const opDecl = {
      kind: 'OpDecl',
      span,
      name: 'my_op',
      params: [{ name: 'arg', matcher: { kind: 'MatcherReg8', span } }],
      body: { kind: 'AsmBlock', span, items: [] },
      stackPolicy: 'default',
    } as unknown as OpDeclNode;

    const asmItem: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: 'my_op',
      operands: [],
    };

    const helpers = createOpExpansionOrchestrationHelpers({
      resolveOpCandidates: (name: string) =>
        name.toLowerCase() === opDecl.name.toLowerCase() ? [opDecl] : undefined,
      diagnostics,
      env: {} as never,
      hasStackSlots: false,
      opStackPolicyMode: 'off',
      opExpansionStack: [],
      diagAt: () => {},
      diagAtWithId: (list, sourceSpan, id, message) => {
        list.push({ id, severity: 'error', file: sourceSpan.file, message });
      },
      diagAtWithSeverityAndId: (list, sourceSpan, id, severity, message) => {
        list.push({ id, severity, file: sourceSpan.file, message });
      },
      formatAsmOperandForOpDiag: () => 'arg',
      selectOpOverload: () => ({
        kind: 'arity_mismatch',
        overloads: [opDecl],
        signatures: [`${opDecl.name}(arg)`],
      }),
      summarizeOpStackEffect: () => ({
        kind: 'known',
        delta: 0,
        hasUntrackedSpMutation: false,
      }),
      cloneImmExpr: (value) => value,
      cloneEaExpr: (value) => value,
      cloneOperand: (value: AsmOperandNode) => value,
      flattenEaDottedName: () => undefined,
      normalizeFixedToken: () => undefined,
      inverseConditionName: () => undefined,
      newHiddenLabel: () => '__hidden',
      lowerAsmRange: () => 0,
      syncToFlow: () => {},
    });

    expect(helpers.tryHandleOpExpansion(asmItem)).toBe(true);
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.OpArityMismatch,
      severity: 'error',
      file: 'test.zax',
      messageIncludes: 'No op overload of "my_op" accepts 0 operand(s).',
    });
  });
});
