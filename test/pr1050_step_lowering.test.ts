import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../src/diagnosticTypes.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../src/frontend/ast.js';
import { createAsmInstructionLoweringHelpers } from '../src/lowering/asmInstructionLowering.js';

const span: SourceSpan = {
  file: 'fixture.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function createDiagnostic(message: string): Diagnostic {
  return {
    id: DiagnosticIds.EmitError,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  };
}

describe('PR1050 step lowering', () => {
  it('lowers non-unit byte steps through accumulator arithmetic while preserving saved A', () => {
    const diagnostics: Diagnostic[] = [];
    const emitted: string[] = [];

    const helper = createAsmInstructionLoweringHelpers({
      diagnostics,
      diagAt: (_diags, _span, message) => diagnostics.push(createDiagnostic(message)),
      emitInstr: (head, operands) => {
        emitted.push(
          `${head} ${operands
            .map((operand) => {
              if (operand.kind === 'Reg') return operand.name;
              if (operand.kind === 'Imm' && operand.expr.kind === 'ImmLiteral')
                return `$${operand.expr.value}`;
              if (operand.kind === 'Mem' && operand.expr.kind === 'EaAdd') return '(IX+disp)';
              if (operand.kind === 'Mem' && operand.expr.kind === 'EaName')
                return `(${operand.expr.name})`;
              return operand.kind;
            })
            .join(', ')}`,
        );
        return true;
      },
      emitRawCodeBytes: () => {},
      emitAbs16Fixup: () => {},
      emitAbs16FixupPrefixed: () => {},
      emitRel8Fixup: () => {},
      conditionOpcodeFromName: () => undefined,
      callConditionOpcodeFromName: () => undefined,
      jrConditionOpcodeFromName: () => undefined,
      conditionOpcode: () => undefined,
      symbolicTargetFromExpr: () => undefined,
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
      resolveScalarBinding: () => undefined,
      resolveRawAliasTargetName: () => undefined,
      isModuleStorageName: () => false,
      isFrameSlotName: () => false,
      resolveScalarTypeForLd: () => 'byte',
      resolveEa: () => ({ kind: 'stack', ixDisp: 4, scalar: 'byte' }),
      diagIfRetStackImbalanced: () => {},
      diagIfCallStackUnverifiable: () => {},
      warnIfRawCallTargetsTypedCallable: () => {},
      lowerLdWithEa: () => false,
      pushEaAddress: () => false,
      materializeEaAddressToHL: () => false,
      emitScalarWordLoad: () => false,
      emitScalarWordStore: () => false,
      emitVirtualReg16Transfer: () => false,
      reg16: new Set(['BC', 'DE', 'HL', 'IX', 'IY']),
      emitSyntheticEpilogue: false,
      epilogueLabel: '__zax_epilogue_0',
      emitJumpTo: () => {},
      emitJumpCondTo: () => {},
      syncToFlow: () => {},
      flowRef: { current: { reachable: true } },
    });

    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: 'step',
      operands: [
        { kind: 'Ea', span, expr: { kind: 'EaName', span, name: 'count' } },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 3 } },
      ] satisfies AsmOperandNode[],
    } satisfies AsmInstructionNode);

    expect(diagnostics).toEqual([]);
    expect(emitted).toContain('push BC');
    expect(emitted).toContain('push AF');
    expect(emitted).toContain('ld A, (IX+disp)');
    expect(emitted).toContain('add A, $3');
    expect(emitted).toContain('ld (IX+disp), A');
    expect(emitted).not.toContain('inc E');
  });

  it('lowers non-unit indirect word steps through HL arithmetic and EX DE,HL swaps', () => {
    const diagnostics: Diagnostic[] = [];
    const emitted: string[] = [];

    const helper = createAsmInstructionLoweringHelpers({
      diagnostics,
      diagAt: (_diags, _span, message) => diagnostics.push(createDiagnostic(message)),
      emitInstr: (head, operands) => {
        emitted.push(
          `${head} ${operands
            .map((operand) => {
              if (operand.kind === 'Reg') return operand.name;
              if (operand.kind === 'Imm' && operand.expr.kind === 'ImmLiteral')
                return `$${operand.expr.value}`;
              if (operand.kind === 'Mem' && operand.expr.kind === 'EaName')
                return `(${operand.expr.name})`;
              return operand.kind;
            })
            .join(', ')}`,
        );
        return true;
      },
      emitRawCodeBytes: () => {},
      emitAbs16Fixup: () => {},
      emitAbs16FixupPrefixed: () => {},
      emitRel8Fixup: () => {},
      conditionOpcodeFromName: () => undefined,
      callConditionOpcodeFromName: () => undefined,
      jrConditionOpcodeFromName: () => undefined,
      conditionOpcode: () => undefined,
      symbolicTargetFromExpr: () => undefined,
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
      resolveScalarBinding: () => undefined,
      resolveRawAliasTargetName: () => undefined,
      isModuleStorageName: () => false,
      isFrameSlotName: () => false,
      resolveScalarTypeForLd: () => 'word',
      resolveEa: () => ({ kind: 'indexed', base: 'IX', disp: 0, scalar: 'word' }) as never,
      diagIfRetStackImbalanced: () => {},
      diagIfCallStackUnverifiable: () => {},
      warnIfRawCallTargetsTypedCallable: () => {},
      lowerLdWithEa: () => false,
      pushEaAddress: () => false,
      materializeEaAddressToHL: () => true,
      emitScalarWordLoad: () => false,
      emitScalarWordStore: () => false,
      emitVirtualReg16Transfer: () => false,
      reg16: new Set(['BC', 'DE', 'HL', 'IX', 'IY']),
      emitSyntheticEpilogue: false,
      epilogueLabel: '__zax_epilogue_0',
      emitJumpTo: () => {},
      emitJumpCondTo: () => {},
      syncToFlow: () => {},
      flowRef: { current: { reachable: true } },
    });

    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: 'step',
      operands: [
        { kind: 'Ea', span, expr: { kind: 'EaName', span, name: 'total' } },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: -2 } },
      ] satisfies AsmOperandNode[],
    } satisfies AsmInstructionNode);

    expect(diagnostics).toEqual([]);
    expect(emitted).toContain('push HL');
    expect(emitted).toContain('ld E, (HL)');
    expect(emitted).toContain('ld D, (HL)');
    expect(emitted).toContain('ex DE, HL');
    expect(emitted).toContain('ld BC, $2');
    expect(emitted).toContain('or A');
    expect(emitted).toContain('sbc HL, BC');
  });
});
