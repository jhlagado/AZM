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
import type { FunctionLoweringContext, FunctionLoweringSharedContext } from './functionLowering.js';
import {
  splitFunctionLoweringContext,
  splitFunctionLoweringSharedContext,
} from './functionLoweringSplit.js';

/** #1123 — inputs to {@link initializeFunctionFrame} (alias of {@link FunctionFrameSetupContext}). */
export type FrameContext = FunctionFrameSetupContext;

export interface AssemblerInstructionSetup {
  /** Shared assembler-lowering context. */
  readonly ctx: FunctionLoweringSharedContext;
  /** Shared diagnostic list. */
  readonly diagnostics: FunctionLoweringSharedContext['diagnostics'];
  /** Pending forward symbols. */
  readonly pending: FunctionLoweringSharedContext['pending'];
  /** Trace hook for comments. */
  readonly traceComment: FunctionLoweringSharedContext['traceComment'];
  /** Trace hook for labels. */
  readonly traceLabel: FunctionLoweringSharedContext['traceLabel'];
  /** Registers SP tracking callbacks for asm emission. */
  readonly bindSpTracking: FunctionLoweringSharedContext['bindSpTracking'];
  /** Current emitted code offset. */
  readonly getCodeOffset: FunctionLoweringSharedContext['getCodeOffset'];
  /** General instruction emitter. */
  readonly emitInstr: FunctionLoweringSharedContext['emitInstr'];
  /** Active source segment tag for listing, if any. */
  readonly getCurrentCodeSegmentTag: () => SourceSegmentTag | undefined;
  /** Sets active source segment tag; `undefined` clears. */
  readonly setCurrentCodeSegmentTag: (tag: SourceSegmentTag | undefined) => void;
  /** Resolves a local alias name to its canonical target; `undefined` if not aliased. */
  readonly resolveLocalAliasTargetName: (name: string) => string | undefined;
  /** Evaluates imms in asm with diagnostics; `undefined` if not const. */
  readonly evalImmExprForAsm: (
    expr: import('../frontend/ast.js').ImmExprNode,
  ) => number | undefined;
  /** Symbolic branch target from imm; `undefined` if not a simple symbol+addend. */
  readonly symbolicTargetFromExprForAsm: (
    expr: import('../frontend/ast.js').ImmExprNode,
  ) => { baseLower: string; addend: number } | undefined;
  /** Instruction emitter bound for asm lowering (same as `emitInstr`). */
  readonly emitInstrForAsm: FunctionLoweringSharedContext['emitInstr'];
}

export interface FunctionLoweringSetupPhase extends AssemblerInstructionSetup {
  /** Full function-lowering context. */
  readonly ctx: FunctionLoweringContext;
  /** Function being lowered. */
  readonly item: FunctionLoweringContext['item'];
  /** Narrow context passed into frame setup. */
  readonly frameSetupContext: ReturnType<typeof buildFrameSetupContext>;
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
  /** Nested op-expansion frames for visible op diagnostics. */
  readonly opExpansionStack: OpExpansionFrame[];
  /** Reads current flow state. */
  readonly getFlow: () => FlowState;
  /** Replaces flow state (e.g. after branches). */
  readonly setFlow: (state: FlowState) => void;
  /** Mutable ref to the active flow state. */
  readonly flowRef: { readonly current: FlowState };
  /** Pulls frame-local flags from `flowRef` into lowering scratch state. */
  readonly syncFromFlow: () => void;
  /** Pushes lowering scratch state back into `flowRef`. */
  readonly syncToFlow: () => void;
  /** Emits diagnostic for invalid visible op expansion. */
  readonly appendInvalidOpExpansionDiagnostic: ReturnType<
    typeof createFunctionBodySetupHelpers
  >['appendInvalidOpExpansionDiagnostic'];
  /** Maps a source span to a segment tag for tracing. */
  readonly sourceTagForSpan: ReturnType<typeof createFunctionBodySetupHelpers>['sourceTagForSpan'];
  /** Runs a callback with a bound code-source tag. */
  readonly withCodeSourceTag: ReturnType<
    typeof createFunctionBodySetupHelpers
  >['withCodeSourceTag'];
  /** Allocates a fresh compiler-generated label name. */
  readonly newHiddenLabel: ReturnType<typeof createFunctionBodySetupHelpers>['newHiddenLabel'];
  /** Defines a code label at the current offset. */
  readonly defineCodeLabel: ReturnType<typeof createFunctionBodySetupHelpers>['defineCodeLabel'];
  /** Unconditional jump emitter. */
  readonly emitJumpTo: ReturnType<typeof createFunctionBodySetupHelpers>['emitJumpTo'];
  /** Conditional jump emitter. */
  readonly emitJumpCondTo: ReturnType<typeof createFunctionBodySetupHelpers>['emitJumpCondTo'];
  /** Virtual 16-bit register move (lowering helper). */
  readonly emitVirtualReg16Transfer: ReturnType<
    typeof createFunctionBodySetupHelpers
  >['emitVirtualReg16Transfer'];
}

export type FunctionBodyPhase = Readonly<ReturnType<typeof createAsmBodyOrchestrationHelpers>>;

/** #1123 — setup bundle plus frame phase result (before body lowering). */
export type BodyContext = FunctionLoweringSetupPhase & {
  /** Frame layout, flow state, and synthetic prologue/epilogue helpers after frame setup. */
  readonly frame: FunctionFramePhase;
};

/** #1123 — frame + body orchestration product for finalization. */
export type RewriteContext = BodyContext & {
  /** Asm body orchestration helpers. */
  readonly body: FunctionBodyPhase;
};

function buildFrameSetupContext(
  ctx: FunctionLoweringContext,
  currentCodeSegmentTagRef: { current: SourceSegmentTag | undefined },
) {
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

export function prepareAssemblerInstructionSetupPhase(
  ctx: FunctionLoweringSharedContext,
): AssemblerInstructionSetup {
  const fp = splitFunctionLoweringSharedContext(ctx);
  const {
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

  return {
    ctx,
    diagnostics,
    pending,
    traceComment,
    traceLabel,
    bindSpTracking,
    getCodeOffset,
    emitInstr,
    getCurrentCodeSegmentTag: () => currentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    ...asmRewriting,
  };
}

export function prepareFunctionLoweringSetupPhase(
  ctx: FunctionLoweringContext,
): FunctionLoweringSetupPhase {
  const setup = prepareAssemblerInstructionSetupPhase(ctx);
  const frameSetupContext = buildFrameSetupContext(
    { ...ctx, emitInstr: setup.emitInstr },
    {
      get current() {
        return setup.getCurrentCodeSegmentTag();
      },
      set current(value: SourceSegmentTag | undefined) {
        setup.setCurrentCodeSegmentTag(value);
      },
    },
  );

  return {
    ...setup,
    ctx,
    item: ctx.item,
    frameSetupContext,
  };
}

function buildFunctionFramePhase(
  setup: AssemblerInstructionSetup,
  frameInit: {
    hasStackSlots: boolean;
    emitSyntheticEpilogue: boolean;
    epilogueLabel: string;
    preserveSet: readonly string[];
    trackedSp: { delta: number; valid: boolean; invalid: boolean };
  },
): FunctionFramePhase {
  const {
    ctx: {
      diagnostics,
      diagAt,
      diagAtWithId,
      conditionNameFromOpcode,
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
  } = setup;
  const { hasStackSlots, emitSyntheticEpilogue, epilogueLabel, preserveSet, trackedSp } = frameInit;

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
    newHiddenLabel,
    defineCodeLabel,
    emitJumpTo,
    emitJumpCondTo,
    emitVirtualReg16Transfer,
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
    emitInstr,
    generatedLabelCounterRef,
    formatAsmOperandForOpDiag,
  });

  const syncFromFlow = (): void => {
    syncFromFlowBase(flow, trackedSp);
  };
  const syncToFlow = (): void => {
    syncToFlowBase(flow, trackedSp);
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
    appendInvalidOpExpansionDiagnostic,
    sourceTagForSpan,
    withCodeSourceTag,
    newHiddenLabel,
    defineCodeLabel,
    emitJumpTo,
    emitJumpCondTo,
    emitVirtualReg16Transfer,
  };
}

export function runFunctionFrameSetupPhase(setup: FunctionLoweringSetupPhase): FunctionFramePhase {
  const { frameSetupContext } = setup;
  const frameInit = initializeFunctionFrame(frameSetupContext);
  return buildFunctionFramePhase(setup, frameInit);
}

/** Frame helpers for native `.azm` assembler source — no function prologue, epilogue, or locals. */
export function createNativeAssemblerFramePhase(
  setup: AssemblerInstructionSetup,
): FunctionFramePhase {
  const { stackSlotOffsets, stackSlotTypes, localAliasTargets } = setup.ctx;
  stackSlotOffsets.clear();
  stackSlotTypes.clear();
  localAliasTargets.clear();
  setup.bindSpTracking(undefined);
  return buildFunctionFramePhase(setup, {
    hasStackSlots: false,
    emitSyntheticEpilogue: false,
    epilogueLabel: '__azm_native_unused_epilogue',
    preserveSet: [],
    trackedSp: { delta: 0, valid: true, invalid: false },
  });
}

/** Instruction emitter bundle shared by function bodies and native assembler source. */
export function createAssemblerInstructionEmitters(
  setup: AssemblerInstructionSetup,
  frame: FunctionFramePhase,
): ReturnType<typeof createFunctionCallLoweringHelpers> {
  const fp = splitFunctionLoweringSharedContext(setup.ctx);
  const {
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
    ...fp.opResolution,
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
      if (frame.hasStackSlots && frame.trackedSp.valid && frame.trackedSp.delta > 0) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic} reached with positive tracked stack delta (${frame.trackedSp.delta}); cannot verify callee stack contract.`,
        );
        return;
      }
      if (frame.hasStackSlots && !frame.trackedSp.valid && frame.trackedSp.invalid) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic} reached after untracked SP mutation; cannot verify callee stack contract.`,
        );
        return;
      }
      if (frame.hasStackSlots && !frame.trackedSp.valid) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic} reached with unknown stack depth; cannot verify callee stack contract.`,
        );
      }
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
    flattenEaDottedName: fp.astUtilities.flattenEaDottedName,
  } as const;

  return createFunctionCallLoweringHelpers({
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
    diagAt: fp.diagnostics.diagAt,
    diagAtWithSeverityAndId: fp.diagnostics.diagAtWithSeverityAndId,
    env: fp.types.env,
    emitInstr,
    emitAbs16Fixup: fp.emission.emitAbs16Fixup,
    syncToFlow: frame.syncToFlow,
    resolveOpCandidates: fp.opResolution.resolveOpCandidates,
    opStackPolicyMode: fp.opResolution.opStackPolicyMode,
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
  });
}

export function prepareFunctionBodyLoweringPhase(ctx: BodyContext): FunctionBodyPhase {
  const { frame, ...setup } = ctx;
  const fp = splitFunctionLoweringContext(setup.ctx);
  const diagnostics = fp.diagnostics.diagnostics;
  const { item } = setup.ctx;
  const { pending, traceComment, traceLabel, emitInstr } = setup;
  const { lowerAsmRange } = createAssemblerInstructionEmitters(setup, frame);

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
