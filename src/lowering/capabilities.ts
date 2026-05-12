import type { Diagnostic, DiagnosticId } from '../diagnosticTypes.js';
import type {
  AsmItemNode,
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  OpDeclNode,
  SourceSpan,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { OpOverloadSelection } from './opMatching.js';
import type { OpStackSummary } from './opStackAnalysis.js';

export interface LoweringDiagnosticsCapability {
  /** Mutable diagnostic list. */
  diagnostics: Diagnostic[];
  /** Span-attached diagnostic. */
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
}

export interface LoweringDiagnosticsWithIdCapability extends LoweringDiagnosticsCapability {
  /** Diagnostic with stable id. */
  diagAtWithId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: DiagnosticId,
    message: string,
  ) => void;
}

export interface LoweringDiagnosticsWithSeverityCapability extends LoweringDiagnosticsWithIdCapability {
  /** Diagnostic with id and severity. */
  diagAtWithSeverityAndId: (
    diagnostics: Diagnostic[],
    span: SourceSpan,
    id: DiagnosticId,
    severity: 'warning' | 'error',
    message: string,
  ) => void;
}

export interface CompileEnvCapability {
  /** Compile environment (module ids, consts, types). */
  env: CompileEnv;
}

export interface AstCloneCapability {
  /** Deep-clone an imm AST node. */
  cloneImmExpr: (expr: ImmExprNode) => ImmExprNode;
  /** Deep-clone an EA AST node. */
  cloneEaExpr: (ea: EaExprNode) => EaExprNode;
  /** Deep-clone an asm operand. */
  cloneOperand: (operand: AsmOperandNode) => AsmOperandNode;
}

export interface DottedEaNameCapability {
  /** Flattens dotted EA to a single string; `undefined` if not a simple dotted path. */
  flattenEaDottedName: (ea: EaExprNode) => string | undefined;
}

export interface FixedTokenNormalizationCapability {
  /** Normalizes fixed tokens for op matching; `undefined` if not applicable. */
  normalizeFixedToken: (operand: AsmOperandNode) => string | undefined;
}

export interface InverseConditionCapability {
  /** Inverts a condition name for opposite branch; `undefined` if unknown. */
  inverseConditionName: (name: string) => string | undefined;
}

export interface HiddenLabelCapability {
  /** Allocates a unique hidden label with `prefix`. */
  newHiddenLabel: (prefix: string) => string;
}

export interface AsmRangeLoweringCapability {
  /** Lowers a contiguous asm range until `stopKinds`; returns next index. */
  lowerAsmRange: (items: readonly AsmItemNode[], startIndex: number, stopKinds: Set<string>) => number;
}

export interface FlowSyncCapability {
  /** Persists structured-control state into the flow ref. */
  syncToFlow: () => void;
}

export interface OpCandidateResolverCapability {
  /** Resolves op overloads; `undefined` if none. */
  resolveOpCandidates: (name: string, file: string) => OpDeclNode[] | undefined;
}

export interface OpOperandFormattingCapability {
  /** Renders an operand for diagnostic text. */
  formatAsmOperandForOpDiag: (operand: AsmOperandNode) => string;
}

export interface OpOverloadSelectionCapability {
  /** Picks overload from operands; returns selection metadata. */
  selectOpOverload: (overloads: OpDeclNode[], operands: AsmOperandNode[]) => OpOverloadSelection;
}

export interface OpStackSummaryCapability {
  /** Summarizes stack delta for an op body. */
  summarizeOpStackEffect: (opDecl: OpDeclNode) => OpStackSummary;
}
