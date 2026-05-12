import { DiagnosticIds } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  SourceSpan,
} from '../frontend/ast.js';
import type {
  AsmRangeLoweringCapability,
  AstCloneCapability,
  CompileEnvCapability,
  DottedEaNameCapability,
  FixedTokenNormalizationCapability,
  FlowSyncCapability,
  HiddenLabelCapability,
  InverseConditionCapability,
  LoweringDiagnosticsWithSeverityCapability,
  OpCandidateResolverCapability,
  OpOperandFormattingCapability,
  OpOverloadSelectionCapability,
  OpStackSummaryCapability,
} from './capabilities.js';
import { createOpExpansionExecutionHelpers } from './opExpansionExecution.js';
import { createOpSubstitutionHelpers } from './opSubstitution.js';

type OpExpansionStackEntry = {
  key: string;
  name: string;
  declSpan: SourceSpan;
  callSiteSpan: SourceSpan;
};

type OpExpansionOrchestrationContext = LoweringDiagnosticsWithSeverityCapability &
  CompileEnvCapability &
  OpCandidateResolverCapability &
  OpOperandFormattingCapability &
  OpOverloadSelectionCapability &
  OpStackSummaryCapability &
  AstCloneCapability &
  DottedEaNameCapability &
  FixedTokenNormalizationCapability &
  InverseConditionCapability &
  HiddenLabelCapability &
  AsmRangeLoweringCapability &
  FlowSyncCapability & {
  hasStackSlots: boolean;
  opStackPolicyMode: 'off' | 'warn' | 'error';
  opExpansionStack: OpExpansionStackEntry[];
};

export function createOpExpansionOrchestrationHelpers(ctx: OpExpansionOrchestrationContext) {
  const tryHandleOpExpansion = (asmItem: AsmInstructionNode): boolean => {
    const opCandidates = ctx.resolveOpCandidates(asmItem.head, asmItem.span.file);
    if (!opCandidates || opCandidates.length === 0) return false;

    const selection = ctx.selectOpOverload(opCandidates, asmItem.operands);
    if (selection.kind === 'arity_mismatch') {
      const available = selection.signatures.map((signature) => `  - ${signature}`).join('\n');
      ctx.diagAtWithId(
        ctx.diagnostics,
        asmItem.span,
        DiagnosticIds.OpArityMismatch,
        `No op overload of "${asmItem.head}" accepts ${asmItem.operands.length} operand(s).\n` +
          `available overloads:\n${available}`,
      );
      return true;
    }

    if (selection.kind === 'no_match') {
      const operandSummary = asmItem.operands.map(ctx.formatAsmOperandForOpDiag).join(', ');
      const available = selection.mismatchDetails.map((detail) => `  - ${detail}`).join('\n');
      ctx.diagAtWithId(
        ctx.diagnostics,
        asmItem.span,
        DiagnosticIds.OpNoMatchingOverload,
        `No matching op overload for "${asmItem.head}" with provided operands.\n` +
          `call-site operands: (${operandSummary})\n` +
          `available overloads:\n${available}`,
      );
      return true;
    }

    if (selection.kind === 'ambiguous') {
      const operandSummary = asmItem.operands.map(ctx.formatAsmOperandForOpDiag).join(', ');
      const equallySpecific = selection.definitions.map((definition) => `  - ${definition}`).join('\n');
      ctx.diagAtWithId(
        ctx.diagnostics,
        asmItem.span,
        DiagnosticIds.OpAmbiguousOverload,
        `Ambiguous op overload for "${asmItem.head}" (${selection.overloads.length} matches).\n` +
          `call-site operands: (${operandSummary})\n` +
          `equally specific candidates:\n${equallySpecific}`,
      );
      return true;
    }

    const opDecl = selection.overload;
    if (ctx.opStackPolicyMode !== 'off' && ctx.hasStackSlots) {
      const summary = ctx.summarizeOpStackEffect(opDecl);
      const severity = ctx.opStackPolicyMode === 'error' ? 'error' : 'warning';
      if (summary.kind === 'known') {
        if (summary.hasUntrackedSpMutation) {
          ctx.diagAtWithSeverityAndId(
            ctx.diagnostics,
            asmItem.span,
            DiagnosticIds.OpStackPolicyRisk,
            severity,
            `op "${opDecl.name}" may mutate SP in an untracked way (static body analysis); invocation inside stack-slot function may invalidate stack verification.`,
          );
        }
        if (summary.delta !== 0) {
          ctx.diagAtWithSeverityAndId(
            ctx.diagnostics,
            asmItem.span,
            DiagnosticIds.OpStackPolicyRisk,
            severity,
            `op "${opDecl.name}" has non-zero static stack delta (${summary.delta}) and is invoked inside stack-slot function.`,
          );
        }
      }
    }

    const opKey = opDecl.name.toLowerCase();
    const cycleStart = ctx.opExpansionStack.findIndex((entry) => entry.key === opKey);
    if (cycleStart !== -1) {
      const cycleChain = [
        ...ctx.opExpansionStack
          .slice(cycleStart)
          .map((entry) => `${entry.name} (${entry.declSpan.file}:${entry.declSpan.start.line})`),
        `${opDecl.name} (${opDecl.span.file}:${opDecl.span.start.line})`,
      ].join(' -> ');
      ctx.diagAtWithId(
        ctx.diagnostics,
        asmItem.span,
        DiagnosticIds.OpExpansionCycle,
        `Cyclic op expansion detected for "${opDecl.name}".\n` + `expansion chain: ${cycleChain}`,
      );
      return true;
    }

    const bindings = new Map<string, AsmOperandNode>();
    for (let idx = 0; idx < opDecl.params.length; idx++) {
      bindings.set(opDecl.params[idx]!.name.toLowerCase(), asmItem.operands[idx]!);
    }

    const {
      substituteImmWithOpLabels,
      substituteOperandWithOpLabels,
      substituteConditionWithOpLabels,
    } = createOpSubstitutionHelpers({
      bindings,
      env: ctx.env,
      diagnostics: ctx.diagnostics,
      diagAt: ctx.diagAt,
      cloneImmExpr: ctx.cloneImmExpr,
      cloneEaExpr: ctx.cloneEaExpr,
      cloneOperand: ctx.cloneOperand,
      flattenEaDottedName: ctx.flattenEaDottedName,
      normalizeFixedToken: ctx.normalizeFixedToken,
      inverseConditionName: ctx.inverseConditionName,
    });

    ctx.opExpansionStack.push({
      key: opKey,
      name: opDecl.name,
      declSpan: opDecl.span,
      callSiteSpan: asmItem.span,
    });
    try {
      const { expandAndLowerOpBody } = createOpExpansionExecutionHelpers({
        diagnostics: ctx.diagnostics,
        diagAt: ctx.diagAt,
        newHiddenLabel: ctx.newHiddenLabel,
        lowerAsmRange: ctx.lowerAsmRange,
      });
      expandAndLowerOpBody({
        opDecl,
        substituteOperandWithOpLabels,
        substituteImmWithOpLabels,
        substituteConditionWithOpLabels,
      });
    } finally {
      ctx.opExpansionStack.pop();
    }
    ctx.syncToFlow();
    return true;
  };

  return {
    tryHandleOpExpansion,
  };
}
