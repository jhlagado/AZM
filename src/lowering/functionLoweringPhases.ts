import type { SourceSegmentTag } from './loweringTypes.js';
import { createAsmInstructionLoweringHelpers } from './asmInstructionLowering.js';
import {
  createFunctionBodySetupHelpers,
  type FlowState,
  type OpExpansionFrame,
} from './functionBodySetup.js';
import { createFunctionCallLoweringHelpers } from './functionCallLowering.js';
import type { FunctionLoweringSharedContext } from './functionLowering.js';
import { splitFunctionLoweringSharedContext } from './functionLoweringSplit.js';

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
}

export interface FunctionFramePhase {
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
  /** Virtual 16-bit register move (lowering helper). */
  readonly emitVirtualReg16Transfer: ReturnType<
    typeof createFunctionBodySetupHelpers
  >['emitVirtualReg16Transfer'];
}

export function prepareAssemblerInstructionSetupPhase(
  ctx: FunctionLoweringSharedContext,
): AssemblerInstructionSetup {
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
  };
}

function buildFunctionFramePhase(
  setup: AssemblerInstructionSetup,
  frameInit: {
    trackedSp: { delta: number; valid: boolean; invalid: boolean };
  },
): FunctionFramePhase {
  const {
    ctx: {
      diagnostics,
      diagAt,
      diagAtWithId,
      formatAsmOperandForOpDiag,
      generatedLabelCounterRef,
      taken,
    },
    pending,
    traceLabel,
    getCodeOffset,
    emitInstr,
    getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag,
  } = setup;
  const { trackedSp } = frameInit;

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
    emitVirtualReg16Transfer,
  };
}

/** Frame helpers for native `.azm` assembler source — no function prologue, epilogue, or locals. */
export function createNativeAssemblerFramePhase(
  setup: AssemblerInstructionSetup,
): FunctionFramePhase {
  setup.bindSpTracking(undefined);
  return buildFunctionFramePhase(setup, {
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
    emitInstr,
    symbolicTargetFromExpr: fp.conditions.symbolicTargetFromExpr,
    evalImmExpr: (expr) => fp.types.evalImmExpr(expr, fp.types.env, diagnostics),
    resolveScalarBinding: fp.types.resolveScalarBinding,
    resolveRawAliasTargetName: () => undefined,
    isModuleStorageName: (name) => fp.storage.storageTypes.has(name.toLowerCase()),
    isFrameSlotName: () => false,
    resolveScalarTypeForLd: fp.types.resolveScalarTypeForLd,
    resolveEa: fp.materialization.resolveEa,
    diagIfRetStackImbalanced: (span, mnemonic) => {
      if (frame.trackedSp.valid && frame.trackedSp.delta !== 0) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic ?? 'ret'} with non-zero tracked stack delta (${frame.trackedSp.delta}); function stack is imbalanced.`,
        );
        return;
      }
      return;
    },
    diagIfCallStackUnverifiable: (options) => {
      void options;
    },
    emitVirtualReg16Transfer: frame.emitVirtualReg16Transfer,
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
    materialization: callMaterialization,
    diagAt: fp.diagnostics.diagAt,
    diagAtWithSeverityAndId: fp.diagnostics.diagAtWithSeverityAndId,
    env: fp.types.env,
    emitInstr,
    emitAbs16Fixup: fp.emission.emitAbs16Fixup,
    syncToFlow: frame.syncToFlow,
    resolveOpCandidates: fp.opResolution.resolveOpCandidates,
    opExpansionStack: frame.opExpansionStack,
    diagAtWithId: fp.diagnostics.diagAtWithId,
    formatAsmOperandForOpDiag: (operand) => fp.opOverload.formatAsmOperandForOpDiag(operand) ?? '?',
    selectOpOverload: fp.opOverload.selectOpOverload,
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
