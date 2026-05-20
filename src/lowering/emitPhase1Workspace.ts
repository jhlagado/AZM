import { resolve } from 'node:path';
import type { ImmExprNode, OpDeclNode, ProgramNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EmittedSourceSegment, SymbolEntry } from '../formats/types.js';
import type { EmitProgramOptions } from './emitPipeline.js';
import type { PendingSymbol } from './loweringTypes.js';
import type { LoweredAsmStream, LoweredAsmStreamBlock } from './loweredAsmTypes.js';
import { createEmitVisibilityHelpers } from './emitVisibility.js';

/** Byte maps, listing segments, and lowered-asm recording for phase 1. */
export type EmitPhase1EmissionState = {
  /** Merged map of all emitted bytes across sections (code/data). */
  bytes: Map<number, number>;
  /** Code section bytes only (before merge into `bytes` for some paths). */
  codeBytes: Map<number, number>;
  /** Data section bytes. */
  dataBytes: Map<number, number>;
  /** Source ranges for emitted code bytes (listing/debug). */
  codeSourceSegments: EmittedSourceSegment[];
  /** Stream of lowered asm blocks for tracing. */
  loweredAsmStream: LoweredAsmStream;
  /** Lookup of lowered asm blocks by stable key. */
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
};

/** Op visibility. */
export type EmitPhase1OpRegistry = {
  /** Per-file op overload lists. */
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  /** All declared `op` names (lowercased) for diagnostics. */
  declaredOpNames: Set<string>;
  /** Resolves op candidates visible from a file. */
  resolveVisibleOpCandidates: ReturnType<typeof createEmitVisibilityHelpers>['resolveVisibleOpCandidates'];
};

/** Options and paths fixed for the emit run. */
export type EmitPhase1EmitConfig = {
  /** Entry / primary source file path. */
  primaryFile: string;
  /** Resolved include directories for asset loads. */
  includeDirs: string[];
};

/** Mutable placement maps for the current lowering context. */
export type EmitPhase1PlacementState = {
  /** Optional base imm expressions per section for placement. */
  baseExprs: Partial<Record<'code' | 'data', ImmExprNode>>;
};

/** Root workspace for emit phase 1: grouped sub-objects replace a single flat struct. */
export type EmitPhase1Workspace = {
  emission: EmitPhase1EmissionState;
  symbols: EmitPhase1SymbolState;
  ops: EmitPhase1OpRegistry;
  config: EmitPhase1EmitConfig;
  placement: EmitPhase1PlacementState;
};

export function createEmitPhase1Workspace(
  program: ProgramNode,
  env: CompileEnv,
  options?: EmitProgramOptions,
): EmitPhase1Workspace {
  const bytes = new Map<number, number>();
  const codeBytes = new Map<number, number>();
  const dataBytes = new Map<number, number>();
  const codeSourceSegments: EmittedSourceSegment[] = [];
  const loweredAsmStream: LoweredAsmStream = { blocks: [] };
  const loweredAsmBlocksByKey = new Map<string, LoweredAsmStreamBlock>();
  const absoluteSymbols: SymbolEntry[] = [];
  const symbols: SymbolEntry[] = [];
  const pending: PendingSymbol[] = [];
  const taken = new Set<string>();
  const fixups: EmitPhase1AbsFixup[] = [];
  const rel8Fixups: EmitPhase1Rel8Fixup[] = [];

  const localOpsByFile = new Map<string, Map<string, OpDeclNode[]>>();
  const declaredOpNames = new Set<string>();
  const { resolveVisibleOpCandidates } = createEmitVisibilityHelpers({
    localOpsByFile,
  });
  const baseExprs: Partial<Record<'code' | 'data', ImmExprNode>> = {};

  const firstSourceFile = program.files[0]!;

  const primaryFile = firstSourceFile.span.file ?? program.entryFile;
  const includeDirs = (options?.includeDirs ?? []).map((p) => resolve(p));

  return {
    emission: {
      bytes,
      codeBytes,
      dataBytes,
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
    },
    ops: {
      localOpsByFile,
      declaredOpNames,
      resolveVisibleOpCandidates,
    },
    config: {
      primaryFile,
      includeDirs,
    },
    placement: {
      baseExprs,
    },
  };
}
