import { DiagnosticIds } from '../diagnosticTypes.js';
import type { SourceSegmentTag } from './loweringTypes.js';
import { createAsmInstructionLoweringHelpers } from './asmInstructionLowering.js';
import { createAsmBodyOrchestrationHelpers } from './asmBodyOrchestration.js';
import {
  createFunctionBodySetupHelpers,
  type FlowState,
  type OpExpansionFrame,
} from './functionBodySetup.js';
import { createFunctionAsmRewritingHelpers } from './functionAsmRewriting.js';
import { createFunctionCallLoweringHelpers } from './functionCallLowering.js';
import type { FunctionFrameSetupContext } from './functionFrameSetup.js';
import { initializeFunctionFrame } from './functionFrameSetup.js';
import type { FunctionLoweringContext } from './functionLowering.js';
import { splitFunctionLoweringContext } from './functionLoweringSplit.js';

/** #1123 — inputs to {@link initializeFunctionFrame} (alias of {@link FunctionFrameSetupContext}). */
export type FrameContext = FunctionFrameSetupContext;

export interface FunctionLoweringSetupPhase {
  /** Full function-lowering context. */
  readonly ctx: FunctionLoweringContext;
  /** Function being lowered. */
  readonly item: FunctionLoweringContext['item'];
  /** Shared diagnostic list. */
  readonly diagnostics: FunctionLoweringContext['diagnostics'];
  /** Pending forward symbols. */
  readonly pending: FunctionLoweringContext['pending'];
  /** Trace hook for comments. */
  readonly traceComment: FunctionLoweringContext['traceComment'];
  /** Trace hook for labels. */
  readonly traceLabel: FunctionLoweringContext['traceLabel'];
  /** Registers SP tracking callbacks for asm emission. */
  readonly bindSpTracking: FunctionLoweringContext['bindSpTracking'];
  /** Current emitted code offset. */
  readonly getCodeOffset: FunctionLoweringContext['getCodeOffset'];
  /** General instruction emitter. */
  readonly emitInstr: FunctionLoweringContext['emitInstr'];
  /** Active source segment tag for listing, if any. */
  readonly getCurrentCodeSegmentTag: () => SourceSegmentTag | undefined;
  /** Sets active source segment tag; `undefined` clears. */
  readonly setCurrentCodeSegmentTag: (tag: SourceSegmentTag | undefined) => void;
  /** Narrow context passed into frame setup. */
  readonly frameSetupContext: ReturnType<typeof buildFrameSetupContext>;
  /** Resolves a local alias name to its canonical target; `undefined` if not aliased. */
  readonly resolveLocalAliasTargetName: (name: string) => string | undefined;
  /** Evaluates imms in asm with diagnostics; `undefined` if not const. */
  readonly evalImmExprForAsm: (expr: FunctionLoweringContext['item']['asm']['items'][number]['span'] extends never ? never : import('../frontend/ast.js').ImmExprNode) => number | undefined;
  /** Symbolic branch target from imm; `undefined` if not a simple symbol+addend. */
  readonly symbolicTargetFromExprForAsm: (expr: import('../frontend/ast.js').ImmExprNode) => { baseLower: string; addend: number } | undefined;
  /** Instruction emitter bound for asm lowering (same as `emitInstr`). */
  readonly emitInstrForAsm: FunctionLoweringContext['emitInstr'];
}

export interface FunctionFramePhase {
  /** True when the frame allocates stack slots. */
  readonly hasStackSlots: boolean;
  /** Whether a synthetic epilogue must be emitted at exits. */
  readonly emitSyntheticEpilogue: boolean;
  /** Label name for the shared epilogue target. */
  readonly epilogueLabel: string;
  /** Callee-saved registers that must be preserved across the body. */
  readonly preserveSet: ReadonlyArray<string>;
  /** SP tracking summary: `invalid` when analysis cannot trust SP. */
  readonly trackedSp: { valid: boolean; delta: number; invalid: boolean };
  /** Nested op-expansion frames for structured control. */
  readonly opExpansionStack: OpExpansionFrame[];
  /** Reads current structured-control flow state. */
  readonly getFlow: () => FlowState;
  /** Replaces flow state (e.g. after branches). */
  readonly setFlow: (state: FlowState) => void;
  /** Mutable ref to the active flow state. */
  readonly flowRef: { readonly current: FlowState };
  /** Pulls frame-local flags from `flowRef` into lowering scratch state. */
  readonly syncFromFlow: () => void;
  /** Pushes lowering scratch state back into `flowRef`. */
  readonly syncToFlow: () => void;
  /** Captures flow for nested regions. */
  readonly snapshotFlow: () => FlowState;
  /** Restores a prior snapshot. */
  readonly restoreFlow: (state: FlowState) => void;
  /** Emits diagnostic for invalid op expansion in structured control. */
  readonly appendInvalidOpExpansionDiagnostic: ReturnType<typeof createFunctionBodySetupHelpers>['appendInvalidOpExpansionDiagnostic'];
  /** Maps a source span to a segment tag for tracing. */
  readonly sourceTagForSpan: ReturnType<typeof createFunctionBodySetupHelpers>['sourceTagForSpan'];
  /** Runs a callback with a bound code-source tag. */
  readonly withCodeSourceTag: ReturnType<typeof createFunctionBodySetupHelpers>['withCodeSourceTag'];
  /** Allocates a fresh compiler-generated label name. */
  readonly newHiddenLabel: ReturnType<typeof createFunctionBodySetupHelpers>['newHiddenLabel'];
  /** Defines a code label at the current offset. */
  readonly defineCodeLabel: ReturnType<typeof createFunctionBodySetupHelpers>['defineCodeLabel'];
  /** Unconditional jump emitter. */
  readonly emitJumpTo: ReturnType<typeof createFunctionBodySetupHelpers>['emitJumpTo'];
  /** Conditional jump emitter. */
  readonly emitJumpCondTo: ReturnType<typeof createFunctionBodySetupHelpers>['emitJumpCondTo'];
  /** False-edge jump for structured `if`. */
  readonly emitJumpIfFalse: ReturnType<typeof createFunctionBodySetupHelpers>['emitJumpIfFalse'];
  /** Virtual 16-bit register move (lowering helper). */
  readonly emitVirtualReg16Transfer: ReturnType<typeof createFunctionBodySetupHelpers>['emitVirtualReg16Transfer'];
  /** Merges control-flow at join points. */
  readonly joinFlows: ReturnType<typeof createFunctionBodySetupHelpers>['joinFlows'];
  /** `select` compare to imm16. */
  readonly emitSelectCompareToImm16: ReturnType<typeof createFunctionBodySetupHelpers>['emitSelectCompareToImm16'];
  /** `select` compare reg8 to imm8. */
  readonly emitSelectCompareReg8ToImm8: ReturnType<typeof createFunctionBodySetupHelpers>['emitSelectCompareReg8ToImm8'];
  /** `select` compare reg8 range. */
  readonly emitSelectCompareReg8Range: ReturnType<typeof createFunctionBodySetupHelpers>['emitSelectCompareReg8Range'];
  /** `select` compare imm16 range. */
  readonly emitSelectCompareImm16Range: ReturnType<typeof createFunctionBodySetupHelpers>['emitSelectCompareImm16Range'];
  /** Loads `select` discriminator into HL. */
  readonly loadSelectorIntoHL: ReturnType<typeof createFunctionBodySetupHelpers>['loadSelectorIntoHL'];
}

export type FunctionBodyPhase = Readonly<ReturnType<typeof createAsmBodyOrchestrationHelpers>>;

/** #1123 — setup bundle plus frame phase result (before body lowering). */
export type BodyContext = FunctionLoweringSetupPhase & {
  /** Frame layout, flow state, and synthetic prologue/epilogue helpers after frame setup. */
  readonly frame: FunctionFramePhase;
};

/** #1123 — frame + body orchestration product for finalization. */
export type RewriteContext = BodyContext & {
  /** Asm body orchestration helpers (structured control, instruction lowering). */
  readonly body: FunctionBodyPhase;
};

function buildFrameSetupContext(ctx: FunctionLoweringContext, currentCodeSegmentTagRef: { current: SourceSegmentTag | undefined }) {
  const {
    item,
    diagnostics,
    diag,
    diagAt,
    taken,
    pending,
    traceComment,
    traceLabel,
    bindSpTracking,
    getCodeOffset,
    emitInstr,
    env,
    resolveScalarBinding,
    resolveScalarKind,
    resolveAggregateType: resolveAggregateTypeForFrame,
    resolveEaTypeExpr,
    evalImmExpr,
    stackSlotOffsets,
    stackSlotTypes,
    localAliasTargets,
    storageTypes,
    moduleAliasTargets,
    generatedLabelCounterRef,
    loadImm16ToHL,
  } = ctx;
  const setCurrentCodeSegmentTag = (tag: SourceSegmentTag | undefined): void => {
    currentCodeSegmentTagRef.current = tag;
  };

  return {
    item,
    diagnostics,
    diag,
    diagAt,
    typing: {
      env,
      resolveScalarBinding,
      resolveScalarKind,
      resolveAggregateType: resolveAggregateTypeForFrame,
      resolveEaTypeExpr,
      evalImmExpr,
    },
    storage: {
      stackSlotOffsets,
      stackSlotTypes,
      localAliasTargets,
      storageTypes,
      moduleAliasTargets,
    },
    symbols: {
      taken,
      pending,
      traceComment,
      traceLabel,
      generatedLabelCounterRef,
    },
    emission: {
      getCodeOffset,
      getCurrentCodeSegmentTag: () => currentCodeSegmentTagRef.current,
      setCurrentCodeSegmentTag,
      emitInstr,
      loadImm16ToHL,
    },
    spTracking: {
      bindSpTracking,
    },
  } as const;
}

export function prepareFunctionLoweringSetupPhase(ctx: FunctionLoweringContext): FunctionLoweringSetupPhase {
  const fp = splitFunctionLoweringContext(ctx);
  const {
    item,
    diagnostics,
    pending,
    traceComment,
    traceLabel,
    currentCodeSegmentTagRef,
    bindSpTracking,
    getCodeOffset,
    emitInstr: emitInstrBase,
  } = ctx;
  let currentCodeSegmentTag = currentCodeSegmentTagRef.current;
  const setCurrentCodeSegmentTag = (tag: SourceSegmentTag | undefined): void => {
    currentCodeSegmentTag = tag;
    currentCodeSegmentTagRef.current = tag;
  };
  const emitInstr = emitInstrBase;
  const asmRewriting = createFunctionAsmRewritingHelpers({
    diagnostics: fp.diagnostics.diagnostics,
    diagAt: fp.diagnostics.diagAt,
    evalImmExpr: fp.types.evalImmExpr,
    env: fp.types.env,
    stackSlotOffsets: fp.storage.stackSlotOffsets,
    stackSlotTypes: fp.storage.stackSlotTypes,
    localAliasTargets: fp.storage.localAliasTargets,
    resolveScalarKind: fp.types.resolveScalarKind,
    symbolicTargetFromExpr: fp.conditions.symbolicTargetFromExpr,
    emitInstr,
  });
  const frameSetupContext = buildFrameSetupContext(
    { ...ctx, emitInstr },
    {
      get current() {
        return currentCodeSegmentTag;
      },
      set current(value: SourceSegmentTag | undefined) {
        currentCodeSegmentTag = value;
        currentCodeSegmentTagRef.current = value;
      },
    },
  );

  return {
    ctx,
    item,
    diagnostics,
    pending,
    traceComment,
    traceLabel,
    bindSpTracking,
    getCodeOffset,
    emitInstr,
    getCurrentCodeSegmentTag: () => currentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    frameSetupContext,
    ...asmRewriting,
  };
}

export function runFunctionFrameSetupPhase(setup: FunctionLoweringSetupPhase): FunctionFramePhase {
  const {
    ctx: {
      diagnostics,
      diagAt,
      diagAtWithId,
      conditionNameFromOpcode,
      inverseConditionName,
      conditionOpcodeFromName,
      emitRawCodeBytes,
      pushEaAddress,
      pushMemValue,
      evalImmExpr,
      env,
      reg8,
      formatAsmOperandForOpDiag,
      generatedLabelCounterRef,
      emitAbs16Fixup,
      taken,
    },
    pending,
    traceLabel,
    getCodeOffset,
    emitInstr,
    getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    frameSetupContext,
  } = setup;
  const { hasStackSlots, emitSyntheticEpilogue, epilogueLabel, preserveSet, trackedSp } =
    initializeFunctionFrame(frameSetupContext);

  let flow: FlowState = {
    reachable: true,
    spDelta: 0,
    spValid: true,
    spInvalidDueToMutation: false,
  };
  const flowRef: { readonly current: FlowState } = {
    get current() {
      return flow;
    },
  };
  const opExpansionStack: OpExpansionFrame[] = [];
  const {
    appendInvalidOpExpansionDiagnostic,
    sourceTagForSpan,
    withCodeSourceTag,
    syncFromFlow: syncFromFlowBase,
    syncToFlow: syncToFlowBase,
    snapshotFlow,
    restoreFlow: restoreFlowBase,
    newHiddenLabel,
    defineCodeLabel,
    emitJumpTo,
    emitJumpCondTo,
    emitJumpIfFalse,
    emitVirtualReg16Transfer,
    joinFlows,
    emitSelectCompareToImm16,
    emitSelectCompareReg8ToImm8,
    emitSelectCompareReg8Range,
    emitSelectCompareImm16Range,
    loadSelectorIntoHL,
  } = createFunctionBodySetupHelpers({
    diagnostics,
    diagAt,
    diagAtWithId,
    getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    taken,
    traceLabel,
    pending,
    getCodeOffset,
    emitAbs16Fixup,
    conditionNameFromOpcode,
    inverseConditionName,
    conditionOpcodeFromName,
    emitInstr,
    emitRawCodeBytes,
    loadImm16ToHL: setup.ctx.loadImm16ToHL,
    pushEaAddress,
    pushMemValue,
    evalImmExpr: (expr) => evalImmExpr(expr, env, diagnostics),
    reg8,
    generatedLabelCounterRef,
    formatAsmOperandForOpDiag,
  });

  const syncFromFlow = (): void => {
    syncFromFlowBase(flow, trackedSp);
  };
  const syncToFlow = (): void => {
    syncToFlowBase(flow, trackedSp);
  };
  const restoreFlow = (state: FlowState): void => {
    restoreFlowBase(
      {
        get current() {
          return flow;
        },
        set current(value: FlowState) {
          flow = value;
        },
      },
      state,
      trackedSp,
    );
  };

  return {
    hasStackSlots,
    emitSyntheticEpilogue,
    epilogueLabel,
    preserveSet,
    trackedSp,
    opExpansionStack,
    getFlow: () => flow,
    setFlow: (state: FlowState) => {
      flow = state;
    },
    flowRef,
    syncFromFlow,
    syncToFlow,
    snapshotFlow: () => snapshotFlow(flow),
    restoreFlow,
    appendInvalidOpExpansionDiagnostic,
    sourceTagForSpan,
    withCodeSourceTag,
    newHiddenLabel,
    defineCodeLabel,
    emitJumpTo,
    emitJumpCondTo,
    emitJumpIfFalse,
    emitVirtualReg16Transfer,
    joinFlows,
    emitSelectCompareToImm16,
    emitSelectCompareReg8ToImm8,
    emitSelectCompareReg8Range,
    emitSelectCompareImm16Range,
    loadSelectorIntoHL,
  };
}

export function prepareFunctionBodyLoweringPhase(ctx: BodyContext): FunctionBodyPhase {
  const { frame, ...setup } = ctx;
  const fp = splitFunctionLoweringContext(setup.ctx);
  const { item } = setup.ctx;
  const {
    pending,
    traceComment,
    traceLabel,
    emitInstr,
    getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    resolveLocalAliasTargetName,
    evalImmExprForAsm,
    symbolicTargetFromExprForAsm,
    emitInstrForAsm,
  } = setup;
  const diagnostics = fp.diagnostics.diagnostics;

  const { lowerAsmInstructionDispatcher } = createAsmInstructionLoweringHelpers({
    ...fp.diagnostics,
    ...fp.emission,
    ...fp.conditions,
    ...fp.types,
    ...fp.materialization,
    ...fp.storage,
    ...fp.callableResolution,
    ...fp.opOverload,
    ...fp.astUtilities,
    ...fp.registers,
    emitInstr: emitInstrForAsm,
    symbolicTargetFromExpr: symbolicTargetFromExprForAsm,
    evalImmExpr: evalImmExprForAsm,
    resolveScalarBinding: fp.types.resolveScalarBinding,
    resolveRawAliasTargetName: (name) => resolveLocalAliasTargetName(name.toLowerCase()),
    isModuleStorageName: (name) => fp.storage.storageTypes.has(name.toLowerCase()),
    isFrameSlotName: (name) => fp.storage.stackSlotOffsets.has(name.toLowerCase()),
    resolveScalarTypeForLd: fp.types.resolveScalarTypeForLd,
    resolveEa: fp.materialization.resolveEa,
    diagIfRetStackImbalanced: (span, mnemonic) => {
      if (frame.emitSyntheticEpilogue) return;
      if (frame.trackedSp.valid && frame.trackedSp.delta !== 0) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic ?? 'ret'} with non-zero tracked stack delta (${frame.trackedSp.delta}); function stack is imbalanced.`,
        );
        return;
      }
      if (!frame.trackedSp.valid && frame.trackedSp.invalid && frame.hasStackSlots) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic ?? 'ret'} reached after untracked SP mutation; cannot verify function stack balance.`,
        );
        return;
      }
      if (!frame.trackedSp.valid && frame.hasStackSlots) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic ?? 'ret'} reached with unknown stack depth; cannot verify function stack balance.`,
        );
      }
    },
    diagIfCallStackUnverifiable: (options) => {
      const span = options.span;
      const mnemonic = options.mnemonic ?? 'call';
      const contractKind = options.contractKind ?? 'callee';
      const contractNoun =
        contractKind === 'typed-call' ? 'typed-call boundary contract' : 'callee stack contract';
      if (frame.hasStackSlots && frame.trackedSp.valid && frame.trackedSp.delta > 0) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic} reached with positive tracked stack delta (${frame.trackedSp.delta}); cannot verify ${contractNoun}.`,
        );
        return;
      }
      if (frame.hasStackSlots && !frame.trackedSp.valid && frame.trackedSp.invalid) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic} reached after untracked SP mutation; cannot verify ${contractNoun}.`,
        );
        return;
      }
      if (frame.hasStackSlots && !frame.trackedSp.valid) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic} reached with unknown stack depth; cannot verify ${contractNoun}.`,
        );
      }
    },
    warnIfRawCallTargetsTypedCallable: (span, symbolicTarget) => {
      if (!fp.storage.rawTypedCallWarningsEnabled || !symbolicTarget || symbolicTarget.addend !== 0)
        return;
      const callable = fp.callableResolution.resolveCallable(symbolicTarget.baseLower, span.file);
      if (!callable) return;
      const typedName = callable.node.name;
      fp.diagnostics.diagAtWithSeverityAndId(
        diagnostics,
        span,
        DiagnosticIds.RawCallTypedTargetWarning,
        'warning',
        `Raw call targets typed callable \"${typedName}\" and bypasses typed-call argument/preservation semantics; use typed call syntax unless raw ABI is intentional.`,
      );
    },
    emitVirtualReg16Transfer: frame.emitVirtualReg16Transfer,
    emitSyntheticEpilogue: frame.emitSyntheticEpilogue,
    epilogueLabel: frame.epilogueLabel,
    emitJumpTo: frame.emitJumpTo,
    emitJumpCondTo: frame.emitJumpCondTo,
    syncToFlow: frame.syncToFlow,
    flowRef: frame.flowRef,
  });

  const callMaterialization = {
    enforceEaRuntimeAtomBudget: fp.materialization.enforceEaRuntimeAtomBudget,
    resolveScalarTypeForEa: fp.types.resolveScalarTypeForEa,
    enforceDirectCallSiteEaBudget: fp.materialization.enforceDirectCallSiteEaBudget,
    resolveEaTypeExpr: fp.types.resolveEaTypeExpr,
    pushEaAddress: fp.materialization.pushEaAddress,
    pushMemValue: fp.materialization.pushMemValue,
    resolveScalarBinding: fp.types.resolveScalarBinding,
    flattenEaDottedName: fp.astUtilities.flattenEaDottedName,
    buildEaWordPipeline: fp.materialization.buildEaWordPipeline,
    emitStepPipeline: fp.materialization.emitStepPipeline,
    pushZeroExtendedReg8: fp.materialization.pushZeroExtendedReg8,
    pushImm16: fp.materialization.pushImm16,
  } as const;

  const { lowerAsmRange } = createFunctionCallLoweringHelpers({
    diagnostics,
    asmItemSpanSourceTag: (span) => frame.sourceTagForSpan(span, frame.opExpansionStack),
    getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    appendInvalidOpExpansionDiagnostic: frame.appendInvalidOpExpansionDiagnostic,
    enforceEaRuntimeAtomBudget: fp.materialization.enforceEaRuntimeAtomBudget,
    hasStackSlots: frame.hasStackSlots,
    emitSyntheticEpilogue: frame.emitSyntheticEpilogue,
    getTrackedSpDelta: () => frame.trackedSp.delta,
    setTrackedSpDelta: (value) => {
      frame.trackedSp.delta = value;
    },
    getTrackedSpValid: () => frame.trackedSp.valid,
    setTrackedSpValid: (value) => {
      frame.trackedSp.valid = value;
    },
    getTrackedSpInvalid: () => frame.trackedSp.invalid,
    setTrackedSpInvalid: (value) => {
      frame.trackedSp.invalid = value;
    },
    materialization: callMaterialization,
    rawTypedCallWarningsEnabled: fp.storage.rawTypedCallWarningsEnabled,
    resolveCallable: fp.callableResolution.resolveCallable,
    diagAt: fp.diagnostics.diagAt,
    diagAtWithSeverityAndId: fp.diagnostics.diagAtWithSeverityAndId,
    stackSlotTypes: fp.storage.stackSlotTypes,
    storageTypes: fp.storage.storageTypes,
    resolveArrayType: fp.types.resolveArrayType,
    sameTypeShape: fp.types.sameTypeShape,
    typeDisplay: fp.types.typeDisplay,
    env: fp.types.env,
    evalImmExpr: fp.types.evalImmExpr,
    resolveScalarKind: fp.types.resolveScalarKind,
    resolveAggregateType: fp.types.resolveAggregateType,
    reg8: fp.registers.reg8,
    reg16: fp.registers.reg16,
    emitInstr,
    emitAbs16Fixup: fp.emission.emitAbs16Fixup,
    syncToFlow: frame.syncToFlow,
    resolveOpCandidates: fp.callableResolution.resolveOpCandidates,
    opStackPolicyMode: fp.callableResolution.opStackPolicyMode,
    opExpansionStack: frame.opExpansionStack,
    diagAtWithId: fp.diagnostics.diagAtWithId,
    formatAsmOperandForOpDiag: (operand) => fp.opOverload.formatAsmOperandForOpDiag(operand) ?? '?',
    selectOpOverload: fp.opOverload.selectOpOverload,
    summarizeOpStackEffect: fp.opOverload.summarizeOpStackEffect,
    cloneImmExpr: fp.astUtilities.cloneImmExpr,
    cloneEaExpr: fp.astUtilities.cloneEaExpr,
    cloneOperand: fp.astUtilities.cloneOperand,
    normalizeFixedToken: fp.astUtilities.normalizeFixedToken,
    inverseConditionName: fp.conditions.inverseConditionName,
    newHiddenLabel: frame.newHiddenLabel,
    lowerAsmInstructionDispatcher,
    defineCodeLabel: frame.defineCodeLabel,
    flowRef: frame.flowRef,
    syncFromFlow: frame.syncFromFlow,
    snapshotFlow: frame.snapshotFlow,
    restoreFlow: frame.restoreFlow,
    emitJumpIfFalse: frame.emitJumpIfFalse,
    emitJumpTo: frame.emitJumpTo,
    warnAt: fp.diagnostics.warnAt,
    joinFlows: (left, right, span, contextName) =>
      frame.joinFlows(left, right, span, contextName, frame.hasStackSlots),
    loadSelectorIntoHL: frame.loadSelectorIntoHL,
    emitRawCodeBytes: fp.emission.emitRawCodeBytes,
    emitSelectCompareReg8ToImm8: frame.emitSelectCompareReg8ToImm8,
    emitSelectCompareToImm16: frame.emitSelectCompareToImm16,
    emitSelectCompareReg8Range: frame.emitSelectCompareReg8Range,
    emitSelectCompareImm16Range: frame.emitSelectCompareImm16Range,
  });

  return createAsmBodyOrchestrationHelpers({
    asmItems: item.asm.items,
    itemName: item.name,
    itemSpan: item.span,
    emitSyntheticEpilogue: frame.emitSyntheticEpilogue,
    hasStackSlots: frame.hasStackSlots,
    lowerAsmRange,
    syncToFlow: frame.syncToFlow,
    getFlow: frame.getFlow,
    setFlow: frame.setFlow,
    diagAt: (span, message) => fp.diagnostics.diagAt(diagnostics, span, message),
    emitImplicitRet: () => {
      frame.withCodeSourceTag(frame.sourceTagForSpan(item.span, frame.opExpansionStack), () => {
        emitInstr('ret', [], item.span);
      });
    },
    emitSyntheticEpilogueBody: () => {
      frame.withCodeSourceTag(frame.sourceTagForSpan(item.span, frame.opExpansionStack), () => {
        pending.push({
          kind: 'label',
          name: frame.epilogueLabel,
          section: 'code',
          offset: setup.getCodeOffset(),
          file: item.span.file,
          line: item.span.start.line,
          scope: 'local',
        });
        traceLabel(setup.getCodeOffset(), frame.epilogueLabel);
        const popOrder = frame.preserveSet.slice().reverse();
        for (const reg of popOrder) {
          emitInstr('pop', [{ kind: 'Reg', span: item.span, name: reg }], item.span);
        }
        if (frame.hasStackSlots) {
          emitInstr(
            'ld',
            [
              { kind: 'Reg', span: item.span, name: 'SP' },
              { kind: 'Reg', span: item.span, name: 'IX' },
            ],
            item.span,
          );
          emitInstr('pop', [{ kind: 'Reg', span: item.span, name: 'IX' }], item.span);
        }
        emitInstr('ret', [], item.span);
      });
    },
    traceFunctionEnd: () => {
      traceComment(setup.getCodeOffset(), `func ${item.name} end`);
    },
  });
}

export function finalizeFunctionLoweringPhase(ctx: RewriteContext): void {
  const { body, frame, ...setup } = ctx;
  void frame;
  body.lowerAndFinalizeFunctionBody();
  setup.bindSpTracking(undefined);
  setup.setCurrentCodeSegmentTag(setup.getCurrentCodeSegmentTag());
}
