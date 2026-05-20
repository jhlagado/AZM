import { DiagnosticIds } from '../diagnosticTypes.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  OpDeclNode,
  SourceSpan,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { SourceSegmentTag } from './loweringTypes.js';
import type { OpOverloadSelection } from './opMatching.js';
import type { FlowState, OpExpansionFrame } from './assemblerFlowSetup.js';
import { createAsmRangeLoweringHelpers } from './asmRangeLowering.js';
import { createOpExpansionOrchestrationHelpers } from './opExpansionOrchestration.js';

type CallAddressingContext = {
  enforceEaRuntimeAtomBudget: (operand: AsmOperandNode, context: string) => boolean;
  flattenEaDottedName: (ea: EaExprNode) => string | undefined;
};

type CallLoweringHelpersContext = {
  diagnostics: Diagnostic[];
  asmItemSpanSourceTag: (span: SourceSpan) => SourceSegmentTag;
  getCurrentCodeSegmentTag: () => SourceSegmentTag | undefined;
  setCurrentCodeSegmentTag: (tag: SourceSegmentTag | undefined) => void;
  appendInvalidOpExpansionDiagnostic: (
    asmItem: AsmInstructionNode,
    diagnosticsStart: number,
    stack: OpExpansionFrame[],
  ) => void;
  enforceEaRuntimeAtomBudget: (operand: AsmOperandNode, context: string) => boolean;
  addressing: Readonly<CallAddressingContext>;
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  diagAtWithSeverityAndId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds],
    severity: 'error' | 'warning',
    message: string,
  ) => void;
  env: CompileEnv;
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  syncToFlow: () => void;
  resolveOpCandidates: (name: string, file: string) => OpDeclNode[] | undefined;
  opExpansionStack: OpExpansionFrame[];
  diagAtWithId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds],
    message: string,
  ) => void;
  formatAsmOperandForOpDiag: (operand: AsmOperandNode) => string;
  selectOpOverload: (overloads: OpDeclNode[], operands: AsmOperandNode[]) => OpOverloadSelection;
  cloneImmExpr: (expr: ImmExprNode) => ImmExprNode;
  cloneEaExpr: (expr: EaExprNode) => EaExprNode;
  cloneOperand: (operand: AsmOperandNode) => AsmOperandNode;
  normalizeFixedToken: (operand: AsmOperandNode) => string | undefined;
  inverseConditionName: (name: string) => string | undefined;
  newHiddenLabel: (prefix: string) => string;
  lowerAsmInstructionDispatcher: (asmItem: AsmInstructionNode) => void;
  defineCodeLabel: (name: string, span: SourceSpan, scope: 'global' | 'local') => void;
  flowRef: { readonly current: FlowState };
  syncFromFlow: () => void;
};

export function createCallLoweringHelpers(ctx: CallLoweringHelpersContext) {
  const emitAsmInstruction = (asmItem: AsmInstructionNode): void => {
    const prevTag = ctx.getCurrentCodeSegmentTag();
    const diagnosticsStart = ctx.diagnostics.length;
    ctx.setCurrentCodeSegmentTag(ctx.asmItemSpanSourceTag(asmItem.span));
    try {
      for (const operand of asmItem.operands) {
        if (!ctx.addressing.enforceEaRuntimeAtomBudget(operand, 'Source ea expression')) return;
      }

      const { tryHandleOpExpansion } = createOpExpansionOrchestrationHelpers({
        resolveOpCandidates: ctx.resolveOpCandidates,
        diagnostics: ctx.diagnostics,
        env: ctx.env,
        opExpansionStack: ctx.opExpansionStack,
        diagAt: ctx.diagAt,
        diagAtWithId: ctx.diagAtWithId,
        diagAtWithSeverityAndId: ctx.diagAtWithSeverityAndId,
        formatAsmOperandForOpDiag: ctx.formatAsmOperandForOpDiag,
        selectOpOverload: ctx.selectOpOverload,
        cloneImmExpr: ctx.cloneImmExpr,
        cloneEaExpr: ctx.cloneEaExpr,
        cloneOperand: ctx.cloneOperand,
        flattenEaDottedName: ctx.addressing.flattenEaDottedName,
        normalizeFixedToken: ctx.normalizeFixedToken,
        inverseConditionName: ctx.inverseConditionName,
        newHiddenLabel: ctx.newHiddenLabel,
        lowerAsmRange,
        syncToFlow: ctx.syncToFlow,
      });
      if (tryHandleOpExpansion(asmItem)) return;

      ctx.lowerAsmInstructionDispatcher(asmItem);
    } finally {
      ctx.appendInvalidOpExpansionDiagnostic(asmItem, diagnosticsStart, ctx.opExpansionStack);
      ctx.setCurrentCodeSegmentTag(prevTag);
    }
  };

  const { lowerAsmRange } = createAsmRangeLoweringHelpers({
    sourceTagForSpan: ctx.asmItemSpanSourceTag,
    getCurrentCodeSegmentTag: ctx.getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag: ctx.setCurrentCodeSegmentTag,
    defineCodeLabel: ctx.defineCodeLabel,
    emitAsmInstruction,
    flowRef: ctx.flowRef,
    syncFromFlow: ctx.syncFromFlow,
  });

  return {
    emitAsmInstruction,
    lowerAsmRange,
  };
}
