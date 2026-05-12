import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, ImmExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { StepPipeline, StepReg16, StepReg8 } from './steps.js';

export type DiagAt = (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;

/**
 * Shared dependency surface for value / EA materialization helpers.
 * Semantics align with the same-named members on {@link import('./functionLowering.js').FunctionLoweringContext} where applicable.
 */
export type ValueMaterializationContext = {
  /** Mutable diagnostic list. */
  diagnostics: Diagnostic[];
  /** Span diagnostic helper. */
  diagAt: DiagAt;
  /** Names treated as 8-bit registers for templates. */
  reg8: Set<string>;
  /** EA resolution; `undefined` when unresolved. */
  resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  /** Infers a type for an EA; `undefined` if unknown. */
  resolveEaTypeExpr: (ea: EaExprNode) => TypeExprNode | undefined;
  /** Unwraps aggregate shape; `undefined` if not aggregate. */
  resolveAggregateType: (
    typeExpr: TypeExprNode,
  ) => { kind: 'record' | 'union'; fields: import('../frontend/ast.js').RecordFieldNode[] } | undefined;
  /** Scalar class for a binding name. */
  resolveScalarBinding: (name: string) => 'byte' | 'word' | 'addr' | undefined;
  /** Scalar class for a type expression. */
  resolveScalarKind: (typeExpr: TypeExprNode) => 'byte' | 'word' | 'addr' | undefined;
  /** Storage size; `undefined` if not computable. */
  sizeOfTypeExpr: (typeExpr: TypeExprNode) => number | undefined;
  /** Const imm evaluation with diagnostics. */
  evalImmExpr: (expr: ImmExprNode) => number | undefined;
  /** Best-effort imm evaluation. */
  evalImmNoDiag: (expr: ImmExprNode) => number | undefined;
  /** Encodes one instruction. */
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  /** Emits raw bytes with trace text. */
  emitRawCodeBytes: (bytes: Uint8Array, file: string, asmText: string) => void;
  /** Queues abs16 fixup. */
  emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  /** Load 16-bit imm to DE. */
  loadImm16ToDE: (value: number, span: SourceSpan) => boolean;
  /** Load 16-bit imm to HL. */
  loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
  /** Negate HL (two’s complement). */
  negateHL: (span: SourceSpan) => boolean;
  /** Push 8-bit reg zero-extended to 16 bits. */
  pushZeroExtendedReg8: (reg: string, span: SourceSpan) => boolean;
  /** Emits a step pipeline. */
  emitStepPipeline: (pipeline: StepPipeline, span: SourceSpan) => boolean;
  /** Builds byte-oriented EA pipeline; `null` if unsupported. */
  buildEaBytePipeline: (ea: EaExprNode, span: SourceSpan) => StepPipeline | null;
  /** Builds word-oriented EA pipeline; `null` if unsupported. */
  buildEaWordPipeline: (ea: EaExprNode, span: SourceSpan) => StepPipeline | null;
  /** Scalar word load helper. */
  emitScalarWordLoad: (target: 'HL' | 'DE' | 'BC', resolved: EaResolution | undefined, span: SourceSpan) => boolean;
  /** Formats IX/IY displacement for asm text. */
  formatIxDisp: (disp: number) => string;
  /** Template: load byte ABC form. */
  TEMPLATE_L_ABC: (dest: StepReg8, ea: StepPipeline) => StepPipeline;
  /** Template: load word via DE. */
  TEMPLATE_LW_DE: (ea: StepPipeline) => StepPipeline;
  /** Template: load register pair from EA pipeline. */
  LOAD_RP_EA: (rp: StepReg16) => StepPipeline;
  /** Template: store register pair to EA pipeline. */
  STORE_RP_EA: (rp: StepReg16) => StepPipeline;
};
