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

describe('PR869 := reg8 lowering', () => {
  it('routes reg8 typed storage transfers through typed ld lowering', () => {
    const diagnostics: Diagnostic[] = [];
    const lowered: AsmInstructionNode[] = [];

    const helper = createAsmInstructionLoweringHelpers({
      diagnostics,
      diagAt: (_diags, _span, message) => {
        diagnostics.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          message,
          file: span.file,
          line: span.start.line,
          column: span.start.column,
        });
      },
      emitInstr: () => true,
      emitRawCodeBytes: () => {},
      emitAbs16Fixup: () => {},
      emitAbs16FixupPrefixed: () => {},
      emitRel8Fixup: () => {},
      conditionOpcodeFromName: () => undefined,
      callConditionOpcodeFromName: () => undefined,
      jrConditionOpcodeFromName: () => undefined,
      conditionOpcode: () => undefined,
      symbolicTargetFromExpr: () => undefined,
      evalImmExpr: () => undefined,
      resolveScalarBinding: () => undefined,
      resolveRawAliasTargetName: () => undefined,
      isModuleStorageName: () => false,
      isFrameSlotName: () => false,
      resolveScalarTypeForLd: () => undefined,
      resolveEa: () => undefined,
      diagIfRetStackImbalanced: () => {},
      diagIfCallStackUnverifiable: () => {},
      warnIfRawCallTargetsTypedCallable: () => {},
      lowerLdWithEa: (inst) => {
        lowered.push(inst);
        return true;
      },
      pushEaAddress: () => false,
      materializeEaAddressToHL: () => false,
      emitScalarWordLoad: () => false,
      emitScalarWordStore: () => false,
      emitVirtualReg16Transfer: () => false,
      reg16: new Set(['BC', 'DE', 'HL']),
      emitSyntheticEpilogue: false,
      epilogueLabel: '__zax_epilogue_0',
      emitJumpTo: () => {},
      emitJumpCondTo: () => {},
      syncToFlow: () => {},
      flowRef: { current: { reachable: true } },
    });

    for (const item of [
      {
        kind: 'AsmInstruction' as const,
        span,
        head: ':=',
        operands: [
          { kind: 'Reg', span, name: 'B' },
          { kind: 'Ea', span, expr: { kind: 'EaName', span, name: 'count' } },
        ] satisfies AsmOperandNode[],
      },
      {
        kind: 'AsmInstruction' as const,
        span,
        head: ':=',
        operands: [
          { kind: 'Reg', span, name: 'B' },
          {
            kind: 'Ea',
            span,
            expr: {
              kind: 'EaIndex',
              span,
              base: { kind: 'EaName', span, name: 'arr' },
              index: { kind: 'IndexEa', span, expr: { kind: 'EaName', span, name: 'idx' } },
            },
          },
        ] satisfies AsmOperandNode[],
      },
      {
        kind: 'AsmInstruction' as const,
        span,
        head: ':=',
        operands: [
          { kind: 'Ea', span, expr: { kind: 'EaName', span, name: 'flags' } },
          { kind: 'Reg', span, name: 'B' },
        ] satisfies AsmOperandNode[],
      },
    ]) {
      helper.lowerAsmInstructionDispatcher(item);
    }

    expect(diagnostics).toEqual([]);
    expect(lowered).toHaveLength(3);
    expect(lowered.map((inst) => inst.head)).toEqual([':=', ':=', ':=']);
  });

  it('lowers reg8 immediates through ld emission', () => {
    const diagnostics: Diagnostic[] = [];
    const emitted: string[] = [];

    const helper = createAsmInstructionLoweringHelpers({
      diagnostics,
      diagAt: (_diags, _span, message) => {
        diagnostics.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          message,
          file: span.file,
          line: span.start.line,
          column: span.start.column,
        });
      },
      emitInstr: (head, operands) => {
        emitted.push(
          `${head} ${operands.map((operand) => (operand.kind === 'Reg' ? operand.name : operand.kind)).join(',')}`,
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
      evalImmExpr: () => undefined,
      resolveScalarBinding: () => undefined,
      resolveRawAliasTargetName: () => undefined,
      isModuleStorageName: () => false,
      isFrameSlotName: () => false,
      resolveScalarTypeForLd: () => undefined,
      resolveEa: () => undefined,
      diagIfRetStackImbalanced: () => {},
      diagIfCallStackUnverifiable: () => {},
      warnIfRawCallTargetsTypedCallable: () => {},
      lowerLdWithEa: () => false,
      pushEaAddress: () => false,
      materializeEaAddressToHL: () => false,
      emitScalarWordLoad: () => false,
      emitScalarWordStore: () => false,
      emitVirtualReg16Transfer: () => false,
      reg16: new Set(['BC', 'DE', 'HL']),
      emitSyntheticEpilogue: false,
      epilogueLabel: '__zax_epilogue_0',
      emitJumpTo: () => {},
      emitJumpCondTo: () => {},
      syncToFlow: () => {},
      flowRef: { current: { reachable: true } },
    });

    for (const reg of ['B', 'C', 'D', 'E', 'H', 'L']) {
      helper.lowerAsmInstructionDispatcher({
        kind: 'AsmInstruction',
        span,
        head: ':=',
        operands: [
          { kind: 'Reg', span, name: reg },
          { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
        ] satisfies AsmOperandNode[],
      });
    }

    expect(diagnostics).toEqual([]);
    expect(emitted).toEqual([
      'ld B,Imm',
      'ld C,Imm',
      'ld D,Imm',
      'ld E,Imm',
      'ld H,Imm',
      'ld L,Imm',
    ]);
  });
});
