import type { StepPipeline } from './steps.js';
import type { Diagnostic, DiagnosticId } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  OpDeclNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { PendingSymbol, ResolvedArrayType, SourceSegmentTag } from './loweringTypes.js';
import type { OpOverloadSelection } from './opMatching.js';
import type { EaResolution } from './eaResolution.js';
import type { AggregateType, ScalarKind } from './typeResolution.js';
// This module owns the shared context for assembler-stream lowering. It wires
// diagnostics, symbol state, type lookup, op expansion, and byte emission into
// the smaller lowering helpers.
export type { ResolvedArrayType } from './loweringTypes.js';

export type AssemblerLoweringDiagnosticsContext = {
  /** Set by: emit/context construction. Mutated by: flow setup, op call expansion, asm instruction lowering, instruction-stream lowering. */
  readonly diagnostics: Diagnostic[];
  /** Set by: emit/context construction. Used by: flow setup. */
  readonly diag: (diagnostics: Diagnostic[], file: string, message: string) => void;
  /** Set by: emit/context construction. Used by: flow setup, op call expansion, asm instruction lowering, instruction-stream lowering. */
  readonly diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  /** Set by: emit/context construction. Used by: flow setup, op call expansion. */
  readonly diagAtWithId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: DiagnosticId,
    message: string,
  ) => void;
  /** Set by: emit/context construction. Used by: op call expansion, asm instruction lowering. */
  readonly diagAtWithSeverityAndId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: DiagnosticId,
    severity: 'error' | 'warning',
    message: string,
  ) => void;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly warnAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
};

export type AssemblerLoweringSymbolContext = {
  /** Set by: emit/context construction. Mutated by: flow setup. Used by: flow setup. */
  readonly taken: Set<string>;
  /** Set by: emit/context construction. Mutated by: flow setup, instruction-stream lowering. Used by: flow setup, instruction-stream lowering. */
  readonly pending: PendingSymbol[];
  /** Set by: emit/context construction. Used by: flow setup. */
  readonly traceComment: (offset: number, text: string) => void;
  /** Set by: emit/context construction. Used by: flow setup, instruction-stream lowering. */
  readonly traceLabel: (offset: number, name: string, span?: SourceSpan) => void;
  /** Set by: emit/context construction. Mutated while lowering native assembler instructions and op expansions. */
  readonly currentCodeSegmentTagRef: { current: SourceSegmentTag | undefined };
  /** Set by: emit/context construction. Mutated by: flow setup. Used by: flow setup. */
  readonly generatedLabelCounterRef: { current: number };
};

export type AssemblerLoweringSpTrackingContext = {
  /** Set by: emit/context construction. Used by: flow setup. */
  readonly bindSpTracking: (
    callbacks?:
      | {
          applySpTracking: (headRaw: string, operands: AsmOperandNode[]) => void;
          invalidateSpTracking: () => void;
        }
      | undefined,
  ) => void;
};

export type AssemblerLoweringEmissionContext = {
  /** Set by: emit/context construction. Used by: flow setup. */
  readonly getCodeOffset: () => number;
  /** Set by: emit/context construction. Used by: asm preparation, flow setup, op call expansion, asm instruction lowering, instruction-stream lowering. */
  readonly emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: flow setup, op call expansion, asm instruction lowering. */
  readonly emitRawCodeBytes: (bs: Uint8Array, file: string, traceText: string) => void;
  /** Set by: emit/context construction. Used by: flow setup and op expansion. */
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

export type AssemblerLoweringConditionContext = {
  /** Set by: emit/context construction. Used by: flow setup and asm instruction lowering. */
  readonly conditionOpcodeFromName: (name: string) => number | undefined;
  /** Set by: emit/context construction. Used by: flow setup. */
  readonly conditionNameFromOpcode: (opcode: number) => string | undefined;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly callConditionOpcodeFromName: (name: string) => number | undefined;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly jrConditionOpcodeFromName: (name: string) => number | undefined;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly conditionOpcode: (operand: AsmOperandNode) => number | undefined;
  /** Set by: emit/context construction. Used by: flow setup and op expansion. */
  readonly inverseConditionName: (name: string) => string | undefined;
  /** Set by: emit/context construction. Used by: asm preparation and asm instruction lowering. */
  readonly symbolicTargetFromExpr: (
    expr: ImmExprNode,
  ) => { baseLower: string; addend: number } | undefined;
};

export type AssemblerLoweringTypeContext = {
  /** Set by: emit/context construction. Used by: asm preparation, flow setup, op call expansion. */
  readonly evalImmExpr: (
    expr: ImmExprNode,
    env: CompileEnv,
    diagnostics: Diagnostic[],
  ) => number | undefined;
  /** Set by: emit/context construction. Used by: asm preparation, flow setup, op call expansion. */
  readonly env: CompileEnv;
  /** Set by: emit/context construction. Used by: flow setup, op call expansion, asm instruction lowering. */
  /** Set by: emit/context construction. Used by: asm preparation, flow setup, op call expansion. */
  readonly resolveScalarKind: (typeExpr: TypeExprNode) => ScalarKind | undefined;
  /** Set by: emit/context construction. Used by: flow setup (layout pointer symbols). */
  readonly resolveAggregateType: (typeExpr: TypeExprNode) => AggregateType | undefined;
  /** Set by: emit/context construction. Used by: flow setup and op expansion. */
  readonly resolveEaTypeExpr: (ea: EaExprNode) => TypeExprNode | undefined;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly resolveArrayType: (
    typeExpr: TypeExprNode,
    env?: CompileEnv,
  ) => ResolvedArrayType | undefined;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly typeDisplay: (typeExpr: TypeExprNode) => string;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly sameTypeShape: (left: TypeExprNode, right: TypeExprNode) => boolean;
};

export type AssemblerLoweringAddressingContext = {
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly enforceEaRuntimeAtomBudget: (operand: AsmOperandNode, context: string) => boolean;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly pushImm16: (value: number, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly pushZeroExtendedReg8: (regName: string, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: flow setup. */
  readonly loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly emitStepPipeline: (pipe: StepPipeline, span: SourceSpan) => boolean;
  /** Set by: emit/context construction. Used by: asm instruction lowering. */
  readonly lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
};

export type AssemblerLoweringOpResolutionContext = {
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly resolveOpCandidates: (name: string, file: string) => OpDeclNode[] | undefined;
};

export type AssemblerLoweringOpOverloadContext = {
  /** Set by: emit/context construction. Used by: flow setup and op expansion. */
  readonly formatAsmOperandForOpDiag: (operand: AsmOperandNode) => string;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly selectOpOverload: (
    overloads: OpDeclNode[],
    operands: AsmOperandNode[],
  ) => OpOverloadSelection;
};

export type AssemblerLoweringAstUtilityContext = {
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly cloneImmExpr: (expr: ImmExprNode) => ImmExprNode;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly cloneEaExpr: (expr: EaExprNode) => EaExprNode;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly cloneOperand: (operand: AsmOperandNode) => AsmOperandNode;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly flattenEaDottedName: (ea: EaExprNode) => string | undefined;
  /** Set by: emit/context construction. Used by: op call expansion. */
  readonly normalizeFixedToken: (operand: AsmOperandNode) => string | undefined;
};

export type AssemblerLoweringRegisterContext = {
  /** Set by: emit/context construction. Used by: flow setup and op expansion. */
  readonly reg8: Set<string>;
  /** Set by: emit/context construction. Used by: op call expansion and asm instruction lowering. */
  readonly reg16: Set<string>;
};

export type AssemblerLoweringSharedContext = AssemblerLoweringDiagnosticsContext &
  AssemblerLoweringSymbolContext &
  AssemblerLoweringSpTrackingContext &
  AssemblerLoweringEmissionContext &
  AssemblerLoweringConditionContext &
  AssemblerLoweringTypeContext &
  AssemblerLoweringAddressingContext &
  AssemblerLoweringOpResolutionContext &
  AssemblerLoweringOpOverloadContext &
  AssemblerLoweringAstUtilityContext &
  AssemblerLoweringRegisterContext;

/**
 * The named slices that merge into {@link AssemblerLoweringSharedContext}. Emit wiring
 * (`emitContextBuilder`) and phase code pass these groups instead of a single flat field bag (#1316).
 */
export type AssemblerLoweringComponentContexts = {
  readonly diagnostics: AssemblerLoweringDiagnosticsContext;
  readonly symbols: AssemblerLoweringSymbolContext;
  readonly spTracking: AssemblerLoweringSpTrackingContext;
  readonly emission: AssemblerLoweringEmissionContext;
  readonly conditions: AssemblerLoweringConditionContext;
  readonly types: AssemblerLoweringTypeContext;
  readonly addressing: AssemblerLoweringAddressingContext;
  readonly opResolution: AssemblerLoweringOpResolutionContext;
  readonly opOverload: AssemblerLoweringOpOverloadContext;
  readonly astUtilities: AssemblerLoweringAstUtilityContext;
  readonly registers: AssemblerLoweringRegisterContext;
};

/** Merge named sub-contexts into the flat intersection used at lowering boundaries. */
export function mergeAssemblerLoweringSharedContext(
  parts: Readonly<AssemblerLoweringComponentContexts>,
): AssemblerLoweringSharedContext {
  return {
    ...parts.diagnostics,
    ...parts.symbols,
    ...parts.spTracking,
    ...parts.emission,
    ...parts.conditions,
    ...parts.types,
    ...parts.addressing,
    ...parts.opResolution,
    ...parts.opOverload,
    ...parts.astUtilities,
    ...parts.registers,
  };
}

export { splitAssemblerLoweringSharedContext } from './assemblerLoweringContextSplit.js';
