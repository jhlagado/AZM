import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../src/diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  SourceSpan,
} from '../src/frontend/ast.js';
import { createAsmInstructionLoweringHelpers } from '../src/lowering/asmInstructionLowering.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';

const span: SourceSpan = {
  file: 'fixture.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function makeHelper(
  overrides: Partial<Parameters<typeof createAsmInstructionLoweringHelpers>[0]> = {},
) {
  const diagnostics: Diagnostic[] = [];
  const loweredLd: AsmInstructionNode[] = [];
  const emittedInstrs: string[] = [];
  let pushedEa: EaExprNode | undefined;

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
      const parts = operands.map((operand) =>
        operand.kind === 'Reg'
          ? operand.name
          : operand.kind === 'Imm'
            ? String(operand.expr.kind === 'ImmLiteral' ? operand.expr.value : operand.expr.kind)
            : operand.kind,
      );
      emittedInstrs.push(`${head} ${parts.join(',')}`);
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
    lowerLdWithEa: (inst) => {
      loweredLd.push(inst);
      return true;
    },
    pushEaAddress: (ea) => {
      pushedEa = ea;
      return true;
    },
    materializeEaAddressToHL: () => false,
    emitScalarWordLoad: () => false,
    emitScalarWordStore: () => false,
    emitVirtualReg16Transfer: (inst) => {
      emittedInstrs.push(
        `virtual ${inst.operands.map((operand) => (operand.kind === 'Reg' ? operand.name : operand.kind)).join(',')}`,
      );
      return true;
    },
    reg16: new Set(['BC', 'DE', 'HL', 'IX', 'IY']),
    emitSyntheticEpilogue: false,
    epilogueLabel: '__zax_epilogue_0',
    emitJumpTo: () => {},
    emitJumpCondTo: () => {},
    syncToFlow: () => {},
    flowRef: { current: { reachable: true } },
    ...overrides,
  });

  return {
    helper,
    diagnostics,
    loweredLd,
    emittedInstrs,
    get pushedEa() {
      return pushedEa;
    },
  };
}

describe('PR863 := lowering', () => {
  it('routes typed storage transfers through shared ld lowering', () => {
    const { helper, diagnostics, loweredLd } = makeHelper();
    const assignItem: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'A' },
        { kind: 'Ea', span, expr: { kind: 'EaName', span, name: 'x' } },
      ] satisfies AsmOperandNode[],
    };

    helper.lowerAsmInstructionDispatcher(assignItem);

    expectNoDiagnostics(diagnostics);
    expect(loweredLd).toHaveLength(1);
    expect(loweredLd[0]).toMatchObject({
      head: ':=',
      operands: [
        { kind: 'Reg', name: 'A' },
        { kind: 'Ea', expr: { kind: 'EaName', name: 'x' } },
      ],
    });
  });

  it('lowers whole-register immediate assignment', () => {
    const { helper, diagnostics, emittedInstrs } = makeHelper({ lowerLdWithEa: () => false });

    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
      ],
    });

    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'A' },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 1 } },
      ],
    });
    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'IX' },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
      ],
    });

    expectNoDiagnostics(diagnostics);
    expect(emittedInstrs).toContain('ld HL,0');
    expect(emittedInstrs).toContain('ld A,1');
    expect(emittedInstrs).toContain('ld IX,0');
  });

  it('lowers pair copy and byte-to-pair widening', () => {
    const { helper, diagnostics, emittedInstrs } = makeHelper({ lowerLdWithEa: () => false });

    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Reg', span, name: 'DE' },
      ],
    });
    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Reg', span, name: 'A' },
      ],
    });
    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'DE' },
        { kind: 'Reg', span, name: 'A' },
      ],
    });
    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'IY' },
        { kind: 'Reg', span, name: 'HL' },
      ],
    });

    expectNoDiagnostics(diagnostics);
    expect(emittedInstrs).toContain('virtual HL,DE');
    expect(emittedInstrs).toContain('ld H,0');
    expect(emittedInstrs).toContain('ld L,A');
    expect(emittedInstrs).toContain('ld D,0');
    expect(emittedInstrs).toContain('ld E,A');
    expect(emittedInstrs).toContain('push HL');
    expect(emittedInstrs).toContain('pop IY');
  });

  it('lowers register address-of rhs via push/pop address materialization', () => {
    const harness = makeHelper({ lowerLdWithEa: () => false });
    const { helper, diagnostics, emittedInstrs } = harness;

    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'IY' },
        {
          kind: 'Ea',
          span,
          expr: { kind: 'EaName', span, name: 'x' },
          explicitAddressOf: true,
        },
      ],
    });

    expectNoDiagnostics(diagnostics);
    expect(harness.pushedEa).toMatchObject({ kind: 'EaName', name: 'x' });
    expect(emittedInstrs).toContain('pop IY');
  });

  it('diagnoses unsupported parsed register combinations', () => {
    const { helper, diagnostics } = makeHelper({
      lowerLdWithEa: () => false,
      emitVirtualReg16Transfer: () => false,
    });

    helper.lowerAsmInstructionDispatcher({
      kind: 'AsmInstruction',
      span,
      head: ':=',
      operands: [
        { kind: 'Reg', span, name: 'A' },
        { kind: 'Reg', span, name: 'DE' },
      ],
    });

    expectDiagnostic(diagnostics, { message: '":=" form is not supported.' });
  });
});
