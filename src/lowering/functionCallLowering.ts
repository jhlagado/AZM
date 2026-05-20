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
import type { OpStackPolicyMode } from '../pipeline.js';
import type { SourceSegmentTag } from './loweringTypes.js';
import type { OpOverloadSelection } from './opMatching.js';
import type { OpStackSummary } from './opStackAnalysis.js';
import type { FlowState, OpExpansionFrame } from './functionBodySetup.js';
import { createAsmRangeLoweringHelpers } from './asmRangeLowering.js';
import { createOpExpansionOrchestrationHelpers } from './opExpansionOrchestration.js';

type FunctionCallMaterializationContext = {
  enforceEaRuntimeAtomBudget: (operand: AsmOperandNode, context: string) => boolean;
  flattenEaDottedName: (ea: EaExprNode) => string | undefined;
};

type FunctionCallLoweringHelpersContext = {
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
  hasStackSlots: boolean;
  emitSyntheticEpilogue: boolean;
  getTrackedSpDelta: () => number;
  setTrackedSpDelta: (value: number) => void;
  getTrackedSpValid: () => boolean;
  setTrackedSpValid: (value: boolean) => void;
  getTrackedSpInvalid: () => boolean;
  setTrackedSpInvalid: (value: boolean) => void;
  materialization: Readonly<FunctionCallMaterializationContext>;
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
  opStackPolicyMode: OpStackPolicyMode;
  opExpansionStack: OpExpansionFrame[];
  diagAtWithId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds],
    message: string,
  ) => void;
  formatAsmOperandForOpDiag: (operand: AsmOperandNode) => string;
  selectOpOverload: (overloads: OpDeclNode[], operands: AsmOperandNode[]) => OpOverloadSelection;
  summarizeOpStackEffect: (op: OpDeclNode) => OpStackSummary;
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

export function createFunctionCallLoweringHelpers(ctx: FunctionCallLoweringHelpersContext) {
  const emitAsmInstruction = (asmItem: AsmInstructionNode): void => {
    const prevTag = ctx.getCurrentCodeSegmentTag();
    const diagnosticsStart = ctx.diagnostics.length;
    ctx.setCurrentCodeSegmentTag(ctx.asmItemSpanSourceTag(asmItem.span));
    try {
      for (const operand of asmItem.operands) {
        if (!ctx.materialization.enforceEaRuntimeAtomBudget(operand, 'Source ea expression')) return;
      }

      const diagIfCallStackUnverifiable = (options?: {
        mnemonic?: string;
      }): void => {
        const mnemonic = options?.mnemonic ?? 'call';
        if (ctx.hasStackSlots && ctx.getTrackedSpValid() && ctx.getTrackedSpDelta() > 0) {
          ctx.diagAt(
            ctx.diagnostics,
            asmItem.span,
            `${mnemonic} reached with positive tracked stack delta (${ctx.getTrackedSpDelta()}); cannot verify callee stack contract.`,
          );
          return;
        }
        if (ctx.hasStackSlots && !ctx.getTrackedSpValid() && ctx.getTrackedSpInvalid()) {
          ctx.diagAt(
            ctx.diagnostics,
            asmItem.span,
            `${mnemonic} reached after untracked SP mutation; cannot verify callee stack contract.`,
          );
          return;
        }
        if (ctx.hasStackSlots && !ctx.getTrackedSpValid()) {
          ctx.diagAt(
            ctx.diagnostics,
            asmItem.span,
            `${mnemonic} reached with unknown stack depth; cannot verify callee stack contract.`,
          );
        }
      };

      const { tryHandleOpExpansion } = createOpExpansionOrchestrationHelpers({
        resolveOpCandidates: ctx.resolveOpCandidates,
        diagnostics: ctx.diagnostics,
        env: ctx.env,
        hasStackSlots: ctx.hasStackSlots,
        opStackPolicyMode: ctx.opStackPolicyMode,
        opExpansionStack: ctx.opExpansionStack,
        diagAt: ctx.diagAt,
        diagAtWithId: ctx.diagAtWithId,
        diagAtWithSeverityAndId: ctx.diagAtWithSeverityAndId,
        formatAsmOperandForOpDiag: ctx.formatAsmOperandForOpDiag,
        selectOpOverload: ctx.selectOpOverload,
        summarizeOpStackEffect: ctx.summarizeOpStackEffect,
        cloneImmExpr: ctx.cloneImmExpr,
        cloneEaExpr: ctx.cloneEaExpr,
        cloneOperand: ctx.cloneOperand,
        flattenEaDottedName: ctx.materialization.flattenEaDottedName,
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
