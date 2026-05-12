import { TEMPLATE_SW_DEBC } from './steps.js';
import { DiagnosticIds } from '../diagnosticTypes.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  OpDeclNode,
  ParamNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { StepPipeline } from './steps.js';
import type { OpStackPolicyMode } from '../pipeline.js';
import type { Callable, ResolvedArrayType, SourceSegmentTag } from './loweringTypes.js';
import type { OpOverloadSelection } from './opMatching.js';
import type { OpStackSummary } from './opStackAnalysis.js';
import type { AggregateType, ScalarKind } from './typeResolution.js';
import type { FlowState, OpExpansionFrame } from './functionBodySetup.js';
import { createAsmRangeLoweringHelpers } from './asmRangeLowering.js';
import { createOpExpansionOrchestrationHelpers } from './opExpansionOrchestration.js';

type FunctionCallMaterializationContext = {
  enforceEaRuntimeAtomBudget: (operand: AsmOperandNode, context: string) => boolean;
  resolveScalarTypeForEa: (ea: EaExprNode) => ScalarKind | undefined;
  enforceDirectCallSiteEaBudget: (operand: AsmOperandNode, calleeName: string) => boolean;
  resolveEaTypeExpr: (ea: EaExprNode) => TypeExprNode | undefined;
  pushEaAddress: (ea: EaExprNode, span: SourceSpan) => boolean;
  pushMemValue: (ea: EaExprNode, want: 'byte' | 'word', span: SourceSpan) => boolean;
  resolveScalarBinding: (name: string) => ScalarKind | undefined;
  flattenEaDottedName: (ea: EaExprNode) => string | undefined;
  buildEaWordPipeline: (ea: EaExprNode, span: SourceSpan) => StepPipeline | null;
  emitStepPipeline: (pipe: StepPipeline, span: SourceSpan) => boolean;
  pushZeroExtendedReg8: (regName: string, span: SourceSpan) => boolean;
  pushImm16: (value: number, span: SourceSpan) => boolean;
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
  rawTypedCallWarningsEnabled: boolean;
  resolveCallable: (name: string, file: string) => Callable | undefined;
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  diagAtWithSeverityAndId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds],
    severity: 'error' | 'warning',
    message: string,
  ) => void;
  stackSlotTypes: Map<string, TypeExprNode>;
  storageTypes: Map<string, TypeExprNode>;
  resolveArrayType: (typeExpr: TypeExprNode, env?: CompileEnv) => ResolvedArrayType | undefined;
  sameTypeShape: (left: TypeExprNode, right: TypeExprNode) => boolean;
  typeDisplay: (typeExpr: TypeExprNode) => string;
  env: CompileEnv;
  evalImmExpr: (expr: ImmExprNode, env: CompileEnv, diagnostics: Diagnostic[]) => number | undefined;
  resolveScalarKind: (typeExpr: TypeExprNode) => ScalarKind | undefined;
  resolveAggregateType: (typeExpr: TypeExprNode) => AggregateType | undefined;
  reg8: Set<string>;
  reg16: Set<string>;
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
  snapshotFlow: () => FlowState;
  restoreFlow: (state: FlowState) => void;
  emitJumpIfFalse: (cc: string, label: string, span: SourceSpan) => boolean;
  emitJumpTo: (label: string, span: SourceSpan) => void;
  warnAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  joinFlows: (left: FlowState, right: FlowState, span: SourceSpan, contextName: string) => FlowState;
  loadSelectorIntoHL: (selector: AsmOperandNode, span: SourceSpan) => boolean;
  emitRawCodeBytes: (bytes: Uint8Array, file: string, trace: string) => void;
  emitSelectCompareReg8ToImm8: (value: number, missLabel: string, span: SourceSpan) => void;
  emitSelectCompareToImm16: (value: number, missLabel: string, span: SourceSpan) => void;
  emitSelectCompareReg8Range: (
    start: number,
    end: number,
    missLabel: string,
    span: SourceSpan,
  ) => void;
  emitSelectCompareImm16Range: (
    start: number,
    end: number,
    missLabel: string,
    span: SourceSpan,
  ) => void;
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
        contractKind?: 'callee' | 'typed-call';
      }): void => {
        const mnemonic = options?.mnemonic ?? 'call';
        const contractKind = options?.contractKind ?? 'callee';
        const contractNoun =
          contractKind === 'typed-call' ? 'typed-call boundary contract' : 'callee stack contract';
        if (ctx.hasStackSlots && ctx.getTrackedSpValid() && ctx.getTrackedSpDelta() > 0) {
          ctx.diagAt(
            ctx.diagnostics,
            asmItem.span,
            `${mnemonic} reached with positive tracked stack delta (${ctx.getTrackedSpDelta()}); cannot verify ${contractNoun}.`,
          );
          return;
        }
        if (ctx.hasStackSlots && !ctx.getTrackedSpValid() && ctx.getTrackedSpInvalid()) {
          ctx.diagAt(
            ctx.diagnostics,
            asmItem.span,
            `${mnemonic} reached after untracked SP mutation; cannot verify ${contractNoun}.`,
          );
          return;
        }
        if (ctx.hasStackSlots && !ctx.getTrackedSpValid()) {
          ctx.diagAt(
            ctx.diagnostics,
            asmItem.span,
            `${mnemonic} reached with unknown stack depth; cannot verify ${contractNoun}.`,
          );
        }
      };

      const callable = ctx.resolveCallable(asmItem.head, asmItem.span.file);
      if (callable) {
        const args = asmItem.operands;
        const params = callable.node.params;
        const calleeName = callable.node.name;
        const restorePreservedRegs = (): boolean => true;
        if (args.length !== params.length) {
          ctx.diagAt(
            ctx.diagnostics,
            asmItem.span,
            `Call to "${asmItem.head}" has ${args.length} argument(s) but expects ${params.length}.`,
          );
          return;
        }
        const requiresDirectCallSiteEaBudget = (arg: AsmOperandNode): boolean => {
          if (arg.kind === 'Mem') return true;
          if (arg.kind !== 'Ea') return false;
          return ctx.materialization.resolveScalarTypeForEa(arg.expr) === undefined;
        };
        for (const arg of args) {
          if (!requiresDirectCallSiteEaBudget(arg)) continue;
          if (!ctx.materialization.enforceDirectCallSiteEaBudget(arg, calleeName)) return;
        }

        const typeForName = (name: string): TypeExprNode | undefined => {
          const lower = name.toLowerCase();
          return ctx.stackSlotTypes.get(lower) ?? ctx.storageTypes.get(lower);
        };
        const typeForArg = (arg: AsmOperandNode): TypeExprNode | undefined => {
          if (arg.kind === 'Ea') return ctx.materialization.resolveEaTypeExpr(arg.expr);
          if (arg.kind === 'Imm' && arg.expr.kind === 'ImmName') return typeForName(arg.expr.name);
          return undefined;
        };
        const pushArgAddressFromName = (name: string): boolean =>
          ctx.materialization.pushEaAddress(
            { kind: 'EaName', span: asmItem.span, name } as EaExprNode,
            asmItem.span,
          );
        const pushArgAddressFromOperand = (arg: AsmOperandNode): boolean => {
          if (arg.kind === 'Ea') return ctx.materialization.pushEaAddress(arg.expr, asmItem.span);
          if (arg.kind === 'Imm' && arg.expr.kind === 'ImmName') return pushArgAddressFromName(arg.expr.name);
          return false;
        };
        const checkNonScalarParamCompatibility = (
          param: ParamNode,
          argType: TypeExprNode,
        ): string | undefined => {
          const paramArray = ctx.resolveArrayType(param.typeExpr);
          const argArray = ctx.resolveArrayType(argType);
          if (paramArray) {
            if (!argArray) {
              return `Incompatible non-scalar argument for parameter "${param.name}": expected ${ctx.typeDisplay(param.typeExpr)}, got ${ctx.typeDisplay(argType)}.`;
            }
            if (!ctx.sameTypeShape(paramArray.element, argArray.element)) {
              return `Incompatible non-scalar argument for parameter "${param.name}": expected element type ${ctx.typeDisplay(paramArray.element)}, got ${ctx.typeDisplay(argArray.element)}.`;
            }
            if (paramArray.length !== undefined) {
              if (argArray.length === undefined) {
                return `Incompatible non-scalar argument for parameter "${param.name}": expected ${ctx.typeDisplay(param.typeExpr)}, got ${ctx.typeDisplay(argType)} (exact length proof required).`;
              }
              if (argArray.length !== paramArray.length) {
                return `Incompatible non-scalar argument for parameter "${param.name}": expected ${ctx.typeDisplay(param.typeExpr)}, got ${ctx.typeDisplay(argType)}.`;
              }
            }
            return undefined;
          }
          if (!ctx.sameTypeShape(param.typeExpr, argType)) {
            return `Incompatible non-scalar argument for parameter "${param.name}": expected ${ctx.typeDisplay(param.typeExpr)}, got ${ctx.typeDisplay(argType)}.`;
          }
          return undefined;
        };
        const pushArgValueFromName = (name: string, want: 'byte' | 'word'): boolean => {
          const scalar = ctx.materialization.resolveScalarBinding(name);
          if (scalar) {
            return ctx.materialization.pushMemValue(
              { kind: 'EaName', span: asmItem.span, name } as EaExprNode,
              want,
              asmItem.span,
            );
          }
          return ctx.materialization.pushEaAddress(
            { kind: 'EaName', span: asmItem.span, name } as EaExprNode,
            asmItem.span,
          );
        };
        const pushArgValueFromEa = (ea: EaExprNode, want: 'byte' | 'word'): boolean => {
          const scalar = ctx.materialization.resolveScalarTypeForEa(ea);
          if (scalar) return ctx.materialization.pushMemValue(ea, want, asmItem.span);
          return ctx.materialization.pushEaAddress(ea, asmItem.span);
        };
        const enumValueFromEa = (ea: EaExprNode): number | undefined => {
          const name = ctx.materialization.flattenEaDottedName(ea);
          if (!name) return undefined;
          return ctx.env.enums.get(name);
        };
        let ok = true;
        let pushedArgWords = 0;
        for (let ai = args.length - 1; ai >= 0; ai--) {
          const arg = args[ai]!;
          const param = params[ai]!;
          const scalarKind =
            ctx.resolveScalarKind(param.typeExpr) ??
            (ctx.resolveAggregateType(param.typeExpr) ? 'addr' : undefined);
          if (!scalarKind) {
            const argType = typeForArg(arg);
            if (!argType) {
              ctx.diagAt(ctx.diagnostics, asmItem.span, `Incompatible non-scalar argument for parameter "${param.name}": expected address-style operand bound to non-scalar storage.`);
              ok = false;
              break;
            }
            const compat = checkNonScalarParamCompatibility(param, argType);
            if (compat) {
              ctx.diagAt(ctx.diagnostics, asmItem.span, compat);
              ok = false;
              break;
            }
            if (!pushArgAddressFromOperand(arg)) {
              ctx.diagAt(ctx.diagnostics, asmItem.span, `Unsupported non-scalar argument form for "${param.name}" in call to "${asmItem.head}".`);
              ok = false;
              break;
            }
            pushedArgWords++;
            continue;
          }
          const isByte = scalarKind === 'byte';
          if (isByte) {
            if (arg.kind === 'Reg' && ctx.reg8.has(arg.name.toUpperCase())) {
              ok = ctx.materialization.pushZeroExtendedReg8(arg.name.toUpperCase(), asmItem.span);
            } else if (arg.kind === 'Imm') {
              const v = ctx.evalImmExpr(arg.expr, ctx.env, ctx.diagnostics);
              if (v === undefined) {
                if (arg.expr.kind === 'ImmName') ok = pushArgValueFromName(arg.expr.name, 'byte');
                else {
                  ctx.diagAt(ctx.diagnostics, asmItem.span, `Failed to evaluate argument "${param.name}".`);
                  ok = false;
                }
              } else ok = ctx.materialization.pushImm16(v & 0xff, asmItem.span);
            } else if (arg.kind === 'Ea') {
              const enumVal = enumValueFromEa(arg.expr);
              if (enumVal !== undefined) ok = ctx.materialization.pushImm16(enumVal & 0xff, asmItem.span);
              else {
                ok = arg.explicitAddressOf
                  ? ctx.materialization.pushEaAddress(arg.expr, asmItem.span)
                  : pushArgValueFromEa(arg.expr, 'byte');
              }
            } else if (arg.kind === 'Mem') {
              ok = ctx.materialization.pushMemValue(arg.expr, 'byte', asmItem.span);
            } else {
              ctx.diagAt(ctx.diagnostics, asmItem.span, `Unsupported byte argument form for "${param.name}" in call to "${asmItem.head}".`);
              ok = false;
            }
          } else {
            if (arg.kind === 'Reg' && ctx.reg16.has(arg.name.toUpperCase())) {
              const regUp = arg.name.toUpperCase();
              const pipe = ctx.materialization.buildEaWordPipeline(
                { kind: 'EaName', span: asmItem.span, name: param.name } as EaExprNode,
                asmItem.span,
              );
              if (pipe) {
                const templated = TEMPLATE_SW_DEBC(regUp as 'DE' | 'BC', pipe);
                if (ctx.materialization.emitStepPipeline(templated, asmItem.span)) {
                  pushedArgWords++;
                  continue;
                }
              }
              ok = ctx.emitInstr('push', [{ kind: 'Reg', span: asmItem.span, name: regUp }], asmItem.span);
            } else if (arg.kind === 'Reg' && ctx.reg8.has(arg.name.toUpperCase())) {
              ok = ctx.materialization.pushZeroExtendedReg8(arg.name.toUpperCase(), asmItem.span);
            } else if (arg.kind === 'Imm') {
              const v = ctx.evalImmExpr(arg.expr, ctx.env, ctx.diagnostics);
              if (v === undefined) {
                if (arg.expr.kind === 'ImmName') ok = pushArgValueFromName(arg.expr.name, 'word');
                else {
                  ctx.diagAt(ctx.diagnostics, asmItem.span, `Failed to evaluate argument "${param.name}".`);
                  ok = false;
                }
              } else ok = ctx.materialization.pushImm16(v & 0xffff, asmItem.span);
            } else if (arg.kind === 'Ea') {
              const enumVal = enumValueFromEa(arg.expr);
              if (enumVal !== undefined) ok = ctx.materialization.pushImm16(enumVal & 0xffff, asmItem.span);
              else {
                ok = arg.explicitAddressOf
                  ? ctx.materialization.pushEaAddress(arg.expr, asmItem.span)
                  : pushArgValueFromEa(arg.expr, 'word');
              }
            } else if (arg.kind === 'Mem') {
              ok = ctx.materialization.pushMemValue(arg.expr, 'word', asmItem.span);
            } else {
              ctx.diagAt(ctx.diagnostics, asmItem.span, `Unsupported word argument form for "${param.name}" in call to "${asmItem.head}".`);
              ok = false;
            }
          }
          if (!ok) break;
          pushedArgWords++;
        }
        if (!ok) {
          for (let k = 0; k < pushedArgWords; k++) {
            ctx.emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
            ctx.emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
          }
          restorePreservedRegs();
          return;
        }
        diagIfCallStackUnverifiable({ mnemonic: `typed call "${calleeName}"`, contractKind: 'typed-call' });
        if (callable.kind === 'extern') ctx.emitAbs16Fixup(0xcd, callable.targetLower, 0, asmItem.span);
        else ctx.emitAbs16Fixup(0xcd, callable.node.name.toLowerCase(), 0, asmItem.span);
        for (let k = 0; k < args.length; k++) {
          ctx.emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
          ctx.emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
        }
        if (!restorePreservedRegs()) return;
        ctx.syncToFlow();
        return;
      }

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
    snapshotFlow: ctx.snapshotFlow,
    restoreFlow: ctx.restoreFlow,
    newHiddenLabel: ctx.newHiddenLabel,
    emitJumpIfFalse: ctx.emitJumpIfFalse,
    emitJumpTo: ctx.emitJumpTo,
    diagAt: (span, message) => ctx.diagAt(ctx.diagnostics, span, message),
    warnAt: (span, message) => ctx.warnAt(ctx.diagnostics, span, message),
    joinFlows: ctx.joinFlows,
    hasStackSlots: ctx.hasStackSlots,
    reg8: ctx.reg8,
    evalImmExpr: (expr) => ctx.evalImmExpr(expr, ctx.env, ctx.diagnostics),
    loadSelectorIntoHL: ctx.loadSelectorIntoHL,
    emitRawCodeBytes: ctx.emitRawCodeBytes,
    emitSelectCompareReg8ToImm8: ctx.emitSelectCompareReg8ToImm8,
    emitSelectCompareToImm16: ctx.emitSelectCompareToImm16,
    emitSelectCompareReg8Range: ctx.emitSelectCompareReg8Range,
    emitSelectCompareImm16Range: ctx.emitSelectCompareImm16Range,
    emitInstr: ctx.emitInstr,
  });

  return {
    emitAsmInstruction,
    lowerAsmRange,
  };
}
