import type { SourceSegmentTag } from './loweringTypes.js';
import { createAsmInstructionLoweringHelpers } from './asmInstructionLowering.js';
import {
  createAssemblerFlowSetupHelpers,
  type FlowState,
  type OpExpansionFrame,
} from './assemblerFlowSetup.js';
import { createAsmInstructionStreamHelpers } from './asmInstructionStream.js';
import type { AssemblerLoweringSharedContext } from './assemblerLoweringContext.js';
import { splitAssemblerLoweringSharedContext } from './assemblerLoweringContextSplit.js';

export interface AssemblerInstructionSetup {
  /** Shared assembler-lowering context. */
  readonly ctx: AssemblerLoweringSharedContext;
  /** Shared diagnostic list. */
  readonly diagnostics: AssemblerLoweringSharedContext['diagnostics'];
  /** Pending forward symbols. */
  readonly pending: AssemblerLoweringSharedContext['pending'];
  /** Trace hook for comments. */
  readonly traceComment: AssemblerLoweringSharedContext['traceComment'];
  /** Trace hook for labels. */
  readonly traceLabel: AssemblerLoweringSharedContext['traceLabel'];
  /** Registers SP tracking callbacks for asm emission. */
  readonly bindSpTracking: AssemblerLoweringSharedContext['bindSpTracking'];
  /** Current emitted code offset. */
  readonly getCodeOffset: AssemblerLoweringSharedContext['getCodeOffset'];
  /** General instruction emitter. */
  readonly emitInstr: AssemblerLoweringSharedContext['emitInstr'];
  /** Active source segment tag for listing, if any. */
  readonly getCurrentCodeSegmentTag: () => SourceSegmentTag | undefined;
  /** Sets active source segment tag; `undefined` clears. */
  readonly setCurrentCodeSegmentTag: (tag: SourceSegmentTag | undefined) => void;
}

export interface AssemblerFlowPhase {
  /** SP tracking summary: `invalid` when analysis cannot trust SP. */
  readonly trackedSp: { valid: boolean; delta: number; invalid: boolean };
  /** Nested op-expansion frames for inline op diagnostics. */
  readonly opExpansionStack: OpExpansionFrame[];
  /** Reads current flow state. */
  readonly getFlow: () => FlowState;
  /** Replaces flow state (e.g. after branches). */
  readonly setFlow: (state: FlowState) => void;
  /** Mutable ref to the active flow state. */
  readonly flowRef: { readonly current: FlowState };
  /** Pulls flow-local flags from `flowRef` into lowering scratch state. */
  readonly syncFromFlow: () => void;
  /** Pushes lowering scratch state back into `flowRef`. */
  readonly syncToFlow: () => void;
  /** Emits diagnostic for invalid inline op expansion. */
  readonly appendInvalidOpExpansionDiagnostic: ReturnType<
    typeof createAssemblerFlowSetupHelpers
  >['appendInvalidOpExpansionDiagnostic'];
  /** Maps a source span to a segment tag for tracing. */
  readonly sourceTagForSpan: ReturnType<typeof createAssemblerFlowSetupHelpers>['sourceTagForSpan'];
  /** Runs a callback with a bound code-source tag. */
  readonly withCodeSourceTag: ReturnType<
    typeof createAssemblerFlowSetupHelpers
  >['withCodeSourceTag'];
  /** Allocates a fresh compiler-generated label name. */
  readonly newHiddenLabel: ReturnType<typeof createAssemblerFlowSetupHelpers>['newHiddenLabel'];
  /** Defines a code label at the current offset. */
  readonly defineCodeLabel: ReturnType<typeof createAssemblerFlowSetupHelpers>['defineCodeLabel'];
  /** Virtual 16-bit register move (lowering helper). */
  readonly emitVirtualReg16Transfer: ReturnType<
    typeof createAssemblerFlowSetupHelpers
  >['emitVirtualReg16Transfer'];
}

export function prepareAssemblerInstructionSetupPhase(
  ctx: AssemblerLoweringSharedContext,
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

function buildAssemblerFlowPhase(
  setup: AssemblerInstructionSetup,
  flowInit: {
    trackedSp: { delta: number; valid: boolean; invalid: boolean };
  },
): AssemblerFlowPhase {
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
  const { trackedSp } = flowInit;

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
  } = createAssemblerFlowSetupHelpers({
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

/** Flow helpers for ASM source: no generated prologue, epilogue, or locals. */
export function createAsmSourceFlowPhase(setup: AssemblerInstructionSetup): AssemblerFlowPhase {
  setup.bindSpTracking(undefined);
  return buildAssemblerFlowPhase(setup, {
    trackedSp: { delta: 0, valid: true, invalid: false },
  });
}

/** Instruction emitter bundle shared by op bodies and ASM source. */
export function createAssemblerInstructionEmitters(
  setup: AssemblerInstructionSetup,
  flow: AssemblerFlowPhase,
): ReturnType<typeof createAsmInstructionStreamHelpers> {
  const fp = splitAssemblerLoweringSharedContext(setup.ctx);
  const { emitInstr, getCurrentCodeSegmentTag, setCurrentCodeSegmentTag } = setup;
  const diagnostics = fp.diagnostics.diagnostics;

  const { lowerAsmInstructionDispatcher } = createAsmInstructionLoweringHelpers({
    ...fp.diagnostics,
    ...fp.emission,
    ...fp.conditions,
    ...fp.types,
    ...fp.addressing,
    ...fp.opResolution,
    ...fp.opOverload,
    ...fp.astUtilities,
    ...fp.registers,
    emitInstr,
    symbolicTargetFromExpr: fp.conditions.symbolicTargetFromExpr,
    evalImmExpr: (expr) => fp.types.evalImmExpr(expr, fp.types.env, diagnostics),
    resolveRawAliasTargetName: () => undefined,
    resolveEa: fp.addressing.resolveEa,
    diagIfRetStackImbalanced: (span, mnemonic) => {
      if (flow.trackedSp.valid && flow.trackedSp.delta !== 0) {
        fp.diagnostics.diagAt(
          diagnostics,
          span,
          `${mnemonic ?? 'ret'} with non-zero tracked stack delta (${flow.trackedSp.delta}); assembler stack is imbalanced.`,
        );
        return;
      }
      return;
    },
    diagIfCallStackUnverifiable: (options) => {
      void options;
    },
    emitVirtualReg16Transfer: flow.emitVirtualReg16Transfer,
    syncToFlow: flow.syncToFlow,
    flowRef: flow.flowRef,
  });

  return createAsmInstructionStreamHelpers({
    diagnostics,
    asmItemSpanSourceTag: (span) => flow.sourceTagForSpan(span, flow.opExpansionStack),
    getCurrentCodeSegmentTag,
    setCurrentCodeSegmentTag,
    appendInvalidOpExpansionDiagnostic: flow.appendInvalidOpExpansionDiagnostic,
    addressing: {
      flattenEaDottedName: fp.astUtilities.flattenEaDottedName,
    },
    diagAt: fp.diagnostics.diagAt,
    diagAtWithSeverityAndId: fp.diagnostics.diagAtWithSeverityAndId,
    env: fp.types.env,
    emitInstr,
    emitAbs16Fixup: fp.emission.emitAbs16Fixup,
    syncToFlow: flow.syncToFlow,
    resolveOpCandidates: fp.opResolution.resolveOpCandidates,
    opExpansionStack: flow.opExpansionStack,
    diagAtWithId: fp.diagnostics.diagAtWithId,
    formatAsmOperandForOpDiag: (operand) => fp.opOverload.formatAsmOperandForOpDiag(operand) ?? '?',
    selectOpOverload: fp.opOverload.selectOpOverload,
    cloneImmExpr: fp.astUtilities.cloneImmExpr,
    cloneEaExpr: fp.astUtilities.cloneEaExpr,
    cloneOperand: fp.astUtilities.cloneOperand,
    normalizeFixedToken: fp.astUtilities.normalizeFixedToken,
    inverseConditionName: fp.conditions.inverseConditionName,
    newHiddenLabel: flow.newHiddenLabel,
    lowerAsmInstructionDispatcher,
    defineCodeLabel: flow.defineCodeLabel,
    flowRef: flow.flowRef,
    syncFromFlow: flow.syncFromFlow,
  });
}
