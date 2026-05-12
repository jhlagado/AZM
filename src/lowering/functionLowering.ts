import type { StepPipeline } from './steps.js';
import type { Diagnostic, DiagnosticId } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  FuncDeclNode,
  ImmExprNode,
  OpDeclNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { OpStackPolicyMode } from '../pipeline.js';
import type { Callable, PendingSymbol, ResolvedArrayType, SourceSegmentTag } from './loweringTypes.js';
import type { OpOverloadSelection } from './opMatching.js';
import type { OpStackSummary } from './opStackAnalysis.js';
import type { EaResolution } from './eaResolution.js';
import type { AggregateType, ScalarKind } from './typeResolution.js';
import {
  finalizeFunctionLoweringPhase,
  prepareFunctionBodyLoweringPhase,
  prepareFunctionLoweringSetupPhase,
  runFunctionFrameSetupPhase,
} from './functionLoweringPhases.js';

// This module owns the per-function lowering coordinator. It assembles the
// function-local helpers, state, and diagnostics around the extracted
// rewriting, frame-setup, body-setup, and call-lowering submodules.
export type { ResolvedArrayType } from './loweringTypes.js';
export type FunctionLoweringItemContext = {
  /** Set by: program lowering construction. Used by: frame setup, body orchestration. */
  readonly item: FuncDeclNode;
};

export type FunctionLoweringDiagnosticsContext = {
  /** Set by: emit/context construction. Mutated by: frame setup, body setup, call lowering, asm instruction lowering, body orchestration. */
  readonly diagnostics: Diagnostic[];
  /** Set by: emit/context construction. Used by: frame setup. */
  readonly diag: (diagnostics: Diagnostic[], file: string, message: string) => void;
  /** Set by: emit/context construction. Used by: frame setup, body setup, call lowering, asm instruction lowering, body orchestration. */
  readonly diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  /** Set by: emit/context construction. Used by: body setup, call lowering. */
  readonly diagAtWithId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: DiagnosticId,
    message: string,
  ) => void;
  /** Set by: emit/context construction. Used by: call lowering, asm instruction lowering. */
  readonly diagAtWithSeverityAndId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: DiagnosticId,
    severity: 'error' | 'warning',
    message: string,
  ) => void;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly warnAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
};

export type FunctionLoweringSymbolContext = {
  /** Set by: emit/context construction. Mutated by: frame setup and body setup. Used by: frame setup and body setup. */
  readonly taken: Set<string>;
  /** Set by: emit/context construction. Mutated by: frame setup, body setup, body orchestration. Used by: frame setup, body setup, body orchestration. */
  readonly pending: PendingSymbol[];
  /** Set by: emit/context construction. Used by: frame setup. */
  readonly traceComment: (offset: number, text: string) => void;
  /** Set by: emit/context construction. Used by: frame setup, body setup, body orchestration. */
  readonly traceLabel: (offset: number, name: string, span?: SourceSpan) => void;
  /** Set by: emit/context construction. Mutated by: lowerFunctionDecl coordination, frame setup, body setup, call lowering, body orchestration. Used by: frame setup, body setup, call lowering. */
  readonly currentCodeSegmentTagRef: { current: SourceSegmentTag | undefined };
  /** Set by: emit/context construction. Mutated by: frame setup and body setup. Used by: frame setup and body setup. */
  readonly generatedLabelCounterRef: { current: number };
};

export type FunctionLoweringSpTrackingContext = {
  /** Set by: emit/context construction. Used by: frame setup. */
  readonly bindSpTracking: (
    callbacks?:
      | {
          applySpTracking: (headRaw: string, operands: AsmOperandNode[]) => void;
          invalidateSpTracking: () => void;
        }
      | undefined,
  ) => void;
};

export type FunctionLoweringEmissionContext = {
  /** Set by: emit/context construction. Used by: frame setup and body setup. */
  readonly getCodeOffset: () => number;
  /** Set by: emit/context construction. Used by: asm rewriting, frame setup, body setup, call lowering, asm instruction lowering, body orchestration. */
  readonly emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: body setup, call lowering, asm instruction lowering. */
  readonly emitRawCodeBytes: (bs: Uint8Array, file: string, traceText: string) => void;
  /** Set by: emit/context construction. Used by: body setup and call lowering. */
  readonly emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly emitAbs16FixupPrefixed: (
    prefix: number,
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly emitRel8Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    mnemonic: string,
  ) => void;
};

export type FunctionLoweringConditionContext = {
  /** Set by: emit/context construction. Used by: body setup and asm instruction lowering. */
  readonly conditionOpcodeFromName: (name: string) => number | undefined;
  /** Set by: emit/context construction. Used by: body setup. */
  readonly conditionNameFromOpcode: (opcode: number) => string | undefined;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly callConditionOpcodeFromName: (name: string) => number | undefined;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly jrConditionOpcodeFromName: (name: string) => number | undefined;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly conditionOpcode: (operand: AsmOperandNode) => number | undefined;
  /** Set by: emit/context construction. Used by: body setup and call lowering. */
  readonly inverseConditionName: (name: string) => string | undefined;
  /** Set by: emit/context construction. Used by: asm rewriting and asm instruction lowering. */
  readonly symbolicTargetFromExpr: (
    expr: ImmExprNode,
  ) => { baseLower: string; addend: number } | undefined;
};

export type FunctionLoweringTypeContext = {
  /** Set by: emit/context construction. Used by: asm rewriting, frame setup, call lowering. */
  readonly evalImmExpr: (
    expr: ImmExprNode,
    env: CompileEnv,
    diagnostics: Diagnostic[],
  ) => number | undefined;
  /** Set by: emit/context construction. Used by: asm rewriting, frame setup, call lowering. */
  readonly env: CompileEnv;
  /** Set by: emit/context construction. Used by: frame setup, call lowering, asm instruction lowering. */
  readonly resolveScalarBinding: (name: string) => ScalarKind | undefined;
  /** Set by: emit/context construction. Used by: asm rewriting, frame setup, call lowering. */
  readonly resolveScalarKind: (typeExpr: TypeExprNode) => ScalarKind | undefined;
  /** Set by: emit/context construction. Used by: frame setup (typed pointer locals). */
  readonly resolveAggregateType: (typeExpr: TypeExprNode) => AggregateType | undefined;
  /** Set by: emit/context construction. Used by: frame setup and call lowering. */
  readonly resolveEaTypeExpr: (ea: EaExprNode) => TypeExprNode | undefined;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly resolveScalarTypeForEa: (ea: EaExprNode) => ScalarKind | undefined;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly resolveScalarTypeForLd: (ea: EaExprNode) => ScalarKind | undefined;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly resolveArrayType: (
    typeExpr: TypeExprNode,
    env?: CompileEnv,
  ) => ResolvedArrayType | undefined;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly typeDisplay: (typeExpr: TypeExprNode) => string;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly sameTypeShape: (left: TypeExprNode, right: TypeExprNode) => boolean;
};

export type FunctionLoweringMaterializationContext = {
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly buildEaWordPipeline: (ea: EaExprNode, span: SourceSpan) => StepPipeline | null;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly enforceEaRuntimeAtomBudget: (operand: AsmOperandNode, context: string) => boolean;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly enforceDirectCallSiteEaBudget: (
    operand: AsmOperandNode,
    calleeName: string,
  ) => boolean;
  /** Set by: emit/context construction. Used by: body setup, call lowering, asm instruction lowering. */
  readonly pushEaAddress: (ea: EaExprNode, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly materializeEaAddressToHL: (ea: EaExprNode, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: body setup and call lowering. */
  readonly pushMemValue: (ea: EaExprNode, want: 'byte' | 'word', span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly pushImm16: (value: number, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly pushZeroExtendedReg8: (regName: string, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: frame setup and body setup. */
  readonly loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly emitStepPipeline: (pipe: StepPipeline, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly emitScalarWordLoad: (
    target: 'HL' | 'DE' | 'BC',
    resolved: EaResolution | undefined,
    span: SourceSpan,
  ) => boolean;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly emitScalarWordStore: (
    source: 'HL' | 'DE' | 'BC',
    resolved: EaResolution | undefined,
    span: SourceSpan,
  ) => boolean;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
};

export type FunctionLoweringStorageContext = {
  /** Set by: emit/context construction. Mutated by: frame setup (contents). Used by: asm rewriting, frame setup, asm instruction lowering. */
  readonly stackSlotOffsets: Map<string, number>;
  /** Set by: emit/context construction. Mutated by: frame setup (contents). Used by: asm rewriting, frame setup, call lowering. */
  readonly stackSlotTypes: Map<string, TypeExprNode>;
  /** Set by: emit/context construction. Mutated by: frame setup (contents). Used by: asm rewriting, frame setup, asm instruction lowering. */
  readonly localAliasTargets: Map<string, EaExprNode>;
  /** Set by: prescan/context construction. Used by: frame setup, call lowering, asm instruction lowering. */
  readonly storageTypes: Map<string, TypeExprNode>;
  /** Set by: prescan/context construction. Used by: frame setup and asm instruction lowering. */
  readonly moduleAliasTargets: Map<string, EaExprNode>;
  /** Set by: emit/context construction. Used by: call lowering and asm instruction lowering. */
  readonly rawTypedCallWarningsEnabled: boolean;
};

export type FunctionLoweringCallableResolutionContext = {
  /** Set by: emit/context construction. Used by: call lowering and asm instruction lowering. */
  readonly resolveCallable: (name: string, file: string) => Callable | undefined;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly resolveOpCandidates: (name: string, file: string) => OpDeclNode[] | undefined;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly opStackPolicyMode: OpStackPolicyMode;
};

export type FunctionLoweringOpOverloadContext = {
  /** Set by: emit/context construction. Used by: body setup and call lowering. */
  readonly formatAsmOperandForOpDiag: (operand: AsmOperandNode) => string;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly selectOpOverload: (
    overloads: OpDeclNode[],
    operands: AsmOperandNode[],
  ) => OpOverloadSelection;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly summarizeOpStackEffect: (op: OpDeclNode) => OpStackSummary;
};

export type FunctionLoweringAstUtilityContext = {
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly cloneImmExpr: (expr: ImmExprNode) => ImmExprNode;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly cloneEaExpr: (expr: EaExprNode) => EaExprNode;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly cloneOperand: (operand: AsmOperandNode) => AsmOperandNode;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly flattenEaDottedName: (ea: EaExprNode) => string | undefined;
  /** Set by: emit/context construction. Used by: call lowering. */
  readonly normalizeFixedToken: (operand: AsmOperandNode) => string | undefined;
};

export type FunctionLoweringRegisterContext = {
  /** Set by: emit/context construction. Used by: body setup and call lowering. */
  readonly reg8: Set<string>;
  /** Set by: emit/context construction. Used by: call lowering and asm instruction lowering. */
  readonly reg16: Set<string>;
};

export type FunctionLoweringSharedContext = FunctionLoweringDiagnosticsContext &
  FunctionLoweringSymbolContext &
  FunctionLoweringSpTrackingContext &
  FunctionLoweringEmissionContext &
  FunctionLoweringConditionContext &
  FunctionLoweringTypeContext &
  FunctionLoweringMaterializationContext &
  FunctionLoweringStorageContext &
  FunctionLoweringCallableResolutionContext &
  FunctionLoweringOpOverloadContext &
  FunctionLoweringAstUtilityContext &
  FunctionLoweringRegisterContext;

/**
 * The twelve named slices that merge into {@link FunctionLoweringSharedContext}. Emit wiring
 * (`emitContextBuilder`) and phase code pass these groups instead of a single flat field bag (#1316).
 */
export type FunctionLoweringComponentContexts = {
  readonly diagnostics: FunctionLoweringDiagnosticsContext;
  readonly symbols: FunctionLoweringSymbolContext;
  readonly spTracking: FunctionLoweringSpTrackingContext;
  readonly emission: FunctionLoweringEmissionContext;
  readonly conditions: FunctionLoweringConditionContext;
  readonly types: FunctionLoweringTypeContext;
  readonly materialization: FunctionLoweringMaterializationContext;
  readonly storage: FunctionLoweringStorageContext;
  readonly callableResolution: FunctionLoweringCallableResolutionContext;
  readonly opOverload: FunctionLoweringOpOverloadContext;
  readonly astUtilities: FunctionLoweringAstUtilityContext;
  readonly registers: FunctionLoweringRegisterContext;
};

/** Merge named sub-contexts into the flat intersection used at lowering boundaries. */
export function mergeFunctionLoweringSharedContext(
  parts: Readonly<FunctionLoweringComponentContexts>,
): FunctionLoweringSharedContext {
  return {
    ...parts.diagnostics,
    ...parts.symbols,
    ...parts.spTracking,
    ...parts.emission,
    ...parts.conditions,
    ...parts.types,
    ...parts.materialization,
    ...parts.storage,
    ...parts.callableResolution,
    ...parts.opOverload,
    ...parts.astUtilities,
    ...parts.registers,
  };
}

/**
 * Entry context for lowering one function: the AST node plus the shared per-function lowering
 * hooks. {@link FunctionLoweringSharedContext} is the hook bundle reused when merging into program
 * lowering; this type adds {@link FunctionLoweringItemContext.item}.
 *
 * Narrower phase views: {@link FrameContext}, {@link BodyContext}, {@link RewriteContext} (#1123).
 */
export type FunctionLoweringContext = FunctionLoweringItemContext & FunctionLoweringSharedContext;

export type { BodyContext, FrameContext, RewriteContext } from './functionLoweringPhases.js';

export {
  splitFunctionLoweringContext,
  splitFunctionLoweringSharedContext,
} from './functionLoweringSplit.js';

export function lowerFunctionDecl(ctx: FunctionLoweringContext): void {
  const setup = prepareFunctionLoweringSetupPhase(ctx);
  const frame = runFunctionFrameSetupPhase(setup);
  const body = prepareFunctionBodyLoweringPhase({ ...setup, frame });
  finalizeFunctionLoweringPhase({ ...setup, frame, body });
}
