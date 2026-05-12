import { resolve } from 'node:path';
import type { ImmExprNode, OpDeclNode, ProgramNode, TypeExprNode, VarDeclNode, EaExprNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EmittedSourceSegment, SymbolEntry } from '../formats/types.js';
import type { EmitProgramOptions } from './emitPipeline.js';
import type { Callable, PendingSymbol } from './loweringTypes.js';
import type { LoweredAsmStream, LoweredAsmStreamBlock } from './loweredAsmTypes.js';
import { createEmitVisibilityHelpers } from './emitVisibility.js';
import { createOpStackAnalysisHelpers } from './opStackAnalysis.js';

/** Byte maps, listing segments, and lowered-asm recording for phase 1. */
export type EmitPhase1EmissionState = {
  /** Merged map of all emitted bytes across sections (code/data/var/hex). */
  bytes: Map<number, number>;
  /** Code section bytes only (before merge into `bytes` for some paths). */
  codeBytes: Map<number, number>;
  /** Data section bytes. */
  dataBytes: Map<number, number>;
  /** Intel HEX–sourced bytes. */
  hexBytes: Map<number, number>;
  /** Source ranges for emitted code bytes (listing/debug). */
  codeSourceSegments: EmittedSourceSegment[];
  /** Stream of lowered asm blocks for tracing. */
  loweredAsmStream: LoweredAsmStream;
  /** Lookup of lowered asm blocks by stable key (named sections, etc.). */
  loweredAsmBlocksByKey: Map<string, LoweredAsmStreamBlock>;
};

export type EmitPhase1AbsFixup = {
  offset: number;
  baseLower: string;
  addend: number;
  file: string;
};

export type EmitPhase1Rel8Fixup = {
  offset: number;
  origin: number;
  baseLower: string;
  addend: number;
  file: string;
  mnemonic: string;
};

export type EmitPhase1DeferredExtern = {
  name: string;
  baseLower: string;
  addend: number;
  file: string;
  line: number;
};

/** Symbol tables, fixup queues, and name reservation. */
export type EmitPhase1SymbolState = {
  /** Symbols with absolute addresses after prescan/lowering. */
  absoluteSymbols: SymbolEntry[];
  /** All collected symbol table entries. */
  symbols: SymbolEntry[];
  /** Pending forward references not yet bound. */
  pending: PendingSymbol[];
  /** Lowercased names already claimed (labels, locals). */
  taken: Set<string>;
  /** Absolute 16-bit fixups pending placement (offset in output, symbol, addend). */
  fixups: EmitPhase1AbsFixup[];
  /** Relative 8-bit PC-relative fixups. */
  rel8Fixups: EmitPhase1Rel8Fixup[];
  /** Extern symbols deferred until link/finalize. */
  deferredExterns: EmitPhase1DeferredExtern[];
};

/** Callable and op visibility, plus op-stack summaries. */
export type EmitPhase1CallableRegistry = {
  /** Per compilation unit: local callable map by lowercased name. */
  localCallablesByFile: Map<string, Map<string, Callable>>;
  /** Globally visible callables after imports. */
  visibleCallables: Map<string, Callable>;
  /** Per-file op overload lists. */
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  /** Visible ops merged by name. */
  visibleOpsByName: Map<string, OpDeclNode[]>;
  /** All declared `op` names (lowercased) for diagnostics. */
  declaredOpNames: Set<string>;
  /** Declared `bin` resource names. */
  declaredBinNames: Set<string>;
  /** Resolves callables visible from a file. */
  resolveVisibleCallable: ReturnType<typeof createEmitVisibilityHelpers>['resolveVisibleCallable'];
  /** Resolves op candidates visible from a file. */
  resolveVisibleOpCandidates: ReturnType<typeof createEmitVisibilityHelpers>['resolveVisibleOpCandidates'];
  /** Cached op stack effect summary for overload policy. */
  summarizeOpStackEffect: ReturnType<typeof createOpStackAnalysisHelpers>['summarizeOpStackEffect'];
};

/** Options and paths fixed for the emit run. */
export type EmitPhase1EmitConfig = {
  /** User-selected op stack policy (`off` when unset in options). */
  opStackPolicyMode: NonNullable<EmitProgramOptions['opStackPolicy']>;
  /** When true, emit extra warnings for raw typed calls. */
  rawTypedCallWarningsEnabled: boolean;
  /** Entry / primary source file path. */
  primaryFile: string;
  /** Resolved include directories for asset loads. */
  includeDirs: string[];
};

/** Mutable storage typing and alias maps for the current lowering context. */
export type EmitPhase1StorageState = {
  /** Global/storage type map from prescan. */
  storageTypes: Map<string, TypeExprNode>;
  /** Module-level alias targets. */
  moduleAliasTargets: Map<string, EaExprNode>;
  /** Alias declarations for diagnostics. */
  moduleAliasDecls: Map<string, VarDeclNode>;
  /** Names used as raw addresses (no typed storage). */
  rawAddressSymbols: Set<string>;
  /** Current function stack slot types (mutable during lowering). */
  stackSlotTypes: Map<string, TypeExprNode>;
  /** Current function stack displacements. */
  stackSlotOffsets: Map<string, number>;
  /** Function-local alias targets. */
  localAliasTargets: Map<string, EaExprNode>;
  /** Optional base imm expressions per section for placement. */
  baseExprs: Partial<Record<'code' | 'data' | 'var', ImmExprNode>>;
};

/** Root workspace for emit phase 1: grouped sub-objects replace a single flat struct. */
export type EmitPhase1Workspace = {
  emission: EmitPhase1EmissionState;
  symbols: EmitPhase1SymbolState;
  callables: EmitPhase1CallableRegistry;
  config: EmitPhase1EmitConfig;
  storage: EmitPhase1StorageState;
};

export function createEmitPhase1Workspace(
  program: ProgramNode,
  env: CompileEnv,
  options?: EmitProgramOptions,
): EmitPhase1Workspace {
  const bytes = new Map<number, number>();
  const codeBytes = new Map<number, number>();
  const dataBytes = new Map<number, number>();
  const hexBytes = new Map<number, number>();
  const codeSourceSegments: EmittedSourceSegment[] = [];
  const loweredAsmStream: LoweredAsmStream = { blocks: [] };
  const loweredAsmBlocksByKey = new Map<string, LoweredAsmStreamBlock>();
  const absoluteSymbols: SymbolEntry[] = [];
  const symbols: SymbolEntry[] = [];
  const pending: PendingSymbol[] = [];
  const taken = new Set<string>();
  const fixups: EmitPhase1AbsFixup[] = [];
  const rel8Fixups: EmitPhase1Rel8Fixup[] = [];
  const deferredExterns: EmitPhase1DeferredExtern[] = [];

  const localCallablesByFile = new Map<string, Map<string, Callable>>();
  const visibleCallables = new Map<string, Callable>();
  const localOpsByFile = new Map<string, Map<string, OpDeclNode[]>>();
  const visibleOpsByName = new Map<string, OpDeclNode[]>();
  const opStackPolicyMode = options?.opStackPolicy ?? 'off';
  const rawTypedCallWarningsEnabled = options?.rawTypedCallWarnings === true;
  const declaredOpNames = new Set<string>();
  const declaredBinNames = new Set<string>();
  const { resolveVisibleCallable, resolveVisibleOpCandidates } = createEmitVisibilityHelpers({
    env,
    localCallablesByFile,
    visibleCallables,
    localOpsByFile,
    visibleOpsByName,
  });
  const { summarizeOpStackEffect } = createOpStackAnalysisHelpers({
    resolveOpCandidates: resolveVisibleOpCandidates,
  });

  const storageTypes = new Map<string, TypeExprNode>();
  const moduleAliasTargets = new Map<string, EaExprNode>();
  const moduleAliasDecls = new Map<string, VarDeclNode>();
  const rawAddressSymbols = new Set<string>();
  const stackSlotTypes = new Map<string, TypeExprNode>();
  const stackSlotOffsets = new Map<string, number>();
  const localAliasTargets = new Map<string, EaExprNode>();
  const baseExprs: Partial<Record<'code' | 'data' | 'var', ImmExprNode>> = {};

  const firstModule = program.files[0]!;

  const primaryFile = firstModule.span.file ?? program.entryFile;
  const includeDirs = (options?.includeDirs ?? []).map((p) => resolve(p));

  return {
    emission: {
      bytes,
      codeBytes,
      dataBytes,
      hexBytes,
      codeSourceSegments,
      loweredAsmStream,
      loweredAsmBlocksByKey,
    },
    symbols: {
      absoluteSymbols,
      symbols,
      pending,
      taken,
      fixups,
      rel8Fixups,
      deferredExterns,
    },
    callables: {
      localCallablesByFile,
      visibleCallables,
      localOpsByFile,
      visibleOpsByName,
      declaredOpNames,
      declaredBinNames,
      resolveVisibleCallable,
      resolveVisibleOpCandidates,
      summarizeOpStackEffect,
    },
    config: {
      opStackPolicyMode,
      rawTypedCallWarningsEnabled,
      primaryFile,
      includeDirs,
    },
    storage: {
      storageTypes,
      moduleAliasTargets,
      moduleAliasDecls,
      rawAddressSymbols,
      stackSlotTypes,
      stackSlotOffsets,
      localAliasTargets,
      baseExprs,
    },
  };
}
