import type {
  ImmExprNode,
  OpDeclNode,
  ProgramNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { AddressRange, EmittedSourceSegment, SymbolEntry } from '../formats/types.js';
import type { CompileEnv } from '../semantics/env.js';
import type { AssemblerLoweringSharedContext } from './assemblerLoweringContext.js';
import type { PendingSymbol, PlacementKind } from './loweringTypes.js';
import type { LoweredAsmItem, LoweredImmExpr } from './loweredAsmTypes.js';
import type { PrescanResult } from './prescanTypes.js';
import type { AggregateType } from '../semantics/typeQueries.js';

// Program lowering owns source-wide declaration traversal and the final
// emission/fixup passes after all symbols and placement bases are known.
// --- Phase 0: shared context and products ---
export type Context = AssemblerLoweringSharedContext & {
  /** Full program AST being lowered. */
  program: ProgramNode;
  /** Resolved include directories for asset loads. */
  includeDirs: string[];
  /** Per-file op overload maps. */
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  /** All declared `op` names (lowercased). */
  declaredOpNames: Set<string>;
  /** Symbols with absolute addresses. */
  absoluteSymbols: SymbolEntry[];
  /** Running symbol table. */
  symbols: SymbolEntry[];
  /** Data-placement byte map. */
  dataBytes: Map<number, number>;
  /** Code-placement byte map. */
  codeBytes: Map<number, number>;
  /** Currently selected code/data placement for emission. */
  activePlacementRef: { current: PlacementKind };
  /** Next code allocation offset (mutable cursor). */
  codeOffsetRef: { current: number };
  /** Next data allocation offset. */
  dataOffsetRef: { current: number };
  /** Optional base imm per placement. */
  baseExprs: Partial<Record<PlacementKind, ImmExprNode>>;
  /** Advances alignment state for `align` directives. */
  advanceAlign: (a: number) => void;
  /** Rounds `n` up to `alignment` bytes. */
  alignTo: (n: number, alignment: number) => number;
  /** Loads a binary asset; `undefined` on failure (diagnostics via `diag`). */
  loadBinInput: (
    file: string,
    fromPath: string,
    includeDirs: string[],
    diag: (file: string, message: string) => void,
  ) => Uint8Array | undefined;
  /** Structural type resolver for records/unions. */
  resolveAggregateType: (type: TypeExprNode) => AggregateType | undefined;
  /** Layout size helper; `undefined` if type cannot be sized. */
  sizeOfTypeExpr: (
    typeExpr: TypeExprNode,
    env: CompileEnv,
    diagnostics: Diagnostic[],
  ) => number | undefined;
  /** Records one lowered asm item for tracing; `span` optional for synthetic items. */
  recordLoweredAsmItem: (item: LoweredAsmItem, span?: SourceSpan) => void;
  /** Lowers an imm AST node to the trace IR. */
  lowerImmExprForLoweredAsm: (expr: ImmExprNode) => LoweredImmExpr;
};

/** Phase 1 — inputs mutated while discovering ops and source-order metadata. */
export type PrescanContext = Pick<
  Context,
  'program' | 'env' | 'diagnostics' | 'localOpsByFile' | 'declaredOpNames' | 'resolveScalarKind'
>;

/**
 * Phase 2 — full program-lowering context after prescan. Prescan outputs are frozen in
 * {@link PrescanResult}; the same map instances remain on `ctx` for lowering (shared refs).
 */
export type LoweringContext = Context & {
  /** Frozen prescan result; map refs alias `ctx` for shared mutation during lowering. */
  readonly prescan: PrescanResult;
};

// --- Phase 2 product: lowered bytes and symbols ---
export type LoweringResult = {
  /** Final code-placement size cursor. */
  codeOffset: number;
  /** Final data-placement size cursor. */
  dataOffset: number;
  /** Still-unresolved symbols after lowering. */
  pending: Context['pending'];
  /** Emitted symbol table. */
  symbols: Context['symbols'];
  /** Absolute-address symbols. */
  absoluteSymbols: Context['absoluteSymbols'];
  /** Emitted code bytes. */
  codeBytes: Context['codeBytes'];
  /** Emitted data bytes. */
  dataBytes: Context['dataBytes'];
};

/**
 * Phase 3 — inputs for placement, fixup resolution, and merged byte emission
 * (`finalizeProgramEmission`).
 */
export type ProgramEmissionFinalizeContext = {
  /** Diagnostics for placement and merge. */
  diagnostics: Diagnostic[];
  /** File-scoped diagnostic helper. */
  diag: (diagnostics: Diagnostic[], file: string, message: string) => void;
  /** Primary source path. */
  primaryFile: string;
  /** Code/data placement base imm expressions. */
  baseExprs: Partial<Record<PlacementKind, ImmExprNode>>;
  /** Imm evaluator; `undefined` when expression is not const. */
  evalImmExpr: (
    expr: ImmExprNode,
    env: CompileEnv,
    diagnostics: Diagnostic[],
  ) => number | undefined;
  /** Compile environment. */
  env: CompileEnv;
  /** Code size after lowering. */
  codeOffset: number;
  /** Data size after lowering. */
  dataOffset: number;
  /** Pending symbols. */
  pending: PendingSymbol[];
  /** Symbol table (may grow during placement). */
  symbols: SymbolEntry[];
  /** Absolute symbols. */
  absoluteSymbols: SymbolEntry[];
  /** Absolute fixup records. */
  fixups: Array<{ offset: number; baseLower: string; addend: number; file: string }>;
  /** Relative fixup records. */
  rel8Fixups: Array<{
    offset: number;
    origin: number;
    baseLower: string;
    addend: number;
    file: string;
    mnemonic: string;
  }>;
  /** Code bytes. */
  codeBytes: Map<number, number>;
  /** Data bytes. */
  dataBytes: Map<number, number>;
  /** Merged working byte map. */
  bytes: Map<number, number>;
  /** Code source segments for listing. */
  codeSourceSegments: EmittedSourceSegment[];
  /** Optional default code load address. */
  defaultCodeBase?: number;
  /** Alignment helper. */
  alignTo: (n: number, alignment: number) => number;
  /** Copies one byte-offset map into the merged `bytes` map. */
  writeBytePlacement: (
    base: number,
    byteOffsets: Map<number, number>,
    bytes: Map<number, number>,
    report: (message: string) => void,
  ) => void;
  /** Min/max written addresses for overlap checks. */
  computeWrittenRange: (bytes: Map<number, number>) => AddressRange;
  /** Rebases listing segments after code base is fixed. */
  rebaseCodeSourceSegments: (
    codeBase: number,
    segments: EmittedSourceSegment[],
  ) => EmittedSourceSegment[];
};

// --- Phase 3: finalization (placement, fixups, emission) ---
export { finalizeProgramEmission } from './programLoweringFinalize.js';
