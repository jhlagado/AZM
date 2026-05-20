/**
 * Emit orchestration phases for `emitProgram`.
 *
 * Pipeline (conceptual):
 *
 * 1. **Workspace setup** — lives in `emit.ts`: placement byte maps, fixup queues, op registries,
 *    resolution helpers, and the program-lowering context (`createEmitProgramContext`). This
 *    phase wires mutable state and callbacks; it does not traverse the whole program yet.
 *
 * 2. **Prescan** — `runEmitPrescanPhase`: discover ops and
 *    raw-address names so later lowering can resolve symbols. Product: {@link PrescanResult}.
 *
 * 3. **Lowering** — `runEmitLoweringPhase`: traverse declarations and instruction streams, emit bytes
 *    into placement maps, enqueue fixups. Product: {@link LoweringResult}.
 *
 * 4. **Placement & artifacts** — `runEmitPlacementAndArtifactPhase`: fixup resolution,
 *    merged `EmittedByteMap`, symbol table, placed lowered-ASM program.
 *    Input: {@link EmitFinalizationContext} (built via {@link mergeEmitFinalizationContext}).
 *
 * Format writers stay in `compile.ts` / `PipelineDeps`; this module only produces the
 * in-memory products they consume.
 */

import type { EmittedByteMap, SymbolEntry } from '../formats/types.js';
import { finalizeEmitProgram, type EmitFinalizationContext } from './emitFinalization.js';
import type { LoweredAsmProgram, LoweredAsmStream } from './loweredAsmTypes.js';
import type { PrescanResult } from './prescanTypes.js';
import { preScanProgramDeclarations } from './programPrescan.js';
import { lowerProgramDeclarations } from './programLoweringTraversal.js';
import {
  type Context as ProgramLoweringContext,
  type LoweringResult,
  type PrescanContext,
} from './programLowering.js';

export type EmitPrescanPhaseContext = PrescanContext;
export type EmitPrescanPhaseResult = PrescanResult;
export type EmitLoweringPhaseContext = ProgramLoweringContext;

export interface EmitLoweringPhaseResult {
  /** Next code-placement allocation offset after lowering. */
  readonly codeOffset: LoweringResult['codeOffset'];
  /** Next data-placement offset. */
  readonly dataOffset: LoweringResult['dataOffset'];
  /** Symbols still pending resolution. */
  readonly pending: LoweringResult['pending'];
  /** Emitted symbol table entries. */
  readonly symbols: LoweringResult['symbols'];
  /** Absolute-address symbols. */
  readonly absoluteSymbols: LoweringResult['absoluteSymbols'];
  /** Emitted code bytes map. */
  readonly codeBytes: LoweringResult['codeBytes'];
  /** Emitted data bytes map. */
  readonly dataBytes: LoweringResult['dataBytes'];
}

/** Options for `emitProgram` (include paths, policy flags, listing sources). */
export type EmitProgramOptions = {
  /** Extra include directories for `include` / assets; omit for none. */
  includeDirs?: string[];
  /** Default code load address for placement; omit uses pipeline default. */
  defaultCodeBase?: number;
  /** Optional full source text per file for listings. */
  sourceTexts?: Map<string, string>;
  /** Optional line-end comments keyed by file and 1-based line. */
  sourceLineComments?: Map<string, Map<number, string>>;
};

/** In-memory compile products passed to format writers (plus trace stream). */
export type EmitProgramResult = {
  /** Final merged address→byte map for writers. */
  map: EmittedByteMap;
  /** Resolved symbol table. */
  symbols: SymbolEntry[];
  /** Raw lowered asm trace from phase 1. */
  loweredAsmStream: LoweredAsmStream;
  /** Lowered asm after placement. */
  placedLoweredAsmProgram: LoweredAsmProgram;
};

/** Finalization inputs that come from phase-1 wiring rather than phase-3 lowering. */
export interface EmitFinalizationPhaseEnv {
  /** Shared diagnostics buffer. */
  readonly diagnostics: EmitFinalizationContext['diagnostics'];
  /** File-level diagnostic helper. */
  readonly diag: EmitFinalizationContext['diag'];
  /** Span-level diagnostic helper. */
  readonly diagAt: EmitFinalizationContext['diagAt'];
  /** Primary source path for diagnostics. */
  readonly primaryFile: EmitFinalizationContext['primaryFile'];
  /** Code/data placement base imm expressions. */
  readonly baseExprs: EmitFinalizationContext['baseExprs'];
  /** Imm evaluator used during placement. */
  readonly evalImmExpr: EmitFinalizationContext['evalImmExpr'];
  /** Compile environment. */
  readonly env: EmitFinalizationContext['env'];
  /** Lowered asm stream to place. */
  readonly loweredAsmStream: EmitFinalizationContext['loweredAsmStream'];
  /** Pending abs16 fixups. */
  readonly fixups: EmitFinalizationContext['fixups'];
  /** Pending rel8 fixups. */
  readonly rel8Fixups: EmitFinalizationContext['rel8Fixups'];
  /** Working byte map before merge. */
  readonly bytes: EmitFinalizationContext['bytes'];
  /** Code source segments for rebasing. */
  readonly codeSourceSegments: EmitFinalizationContext['codeSourceSegments'];
  /** Byte alignment helper. */
  readonly alignTo: EmitFinalizationContext['alignTo'];
  /** Writes a byte-offset slice into the byte map. */
  readonly writeBytePlacement: EmitFinalizationContext['writeBytePlacement'];
  /** Computes written byte ranges for overlap checks. */
  readonly computeWrittenRange: EmitFinalizationContext['computeWrittenRange'];
  /** Rebases source map after placement moves. */
  readonly rebaseCodeSourceSegments: EmitFinalizationContext['rebaseCodeSourceSegments'];
  /** Optional default code base override. */
  readonly defaultCodeBase?: number;
}

export type EmitPlacementPhaseContext = EmitLoweringPhaseResult & EmitFinalizationPhaseEnv;
export type EmitPlacementPhaseResult = Omit<EmitProgramResult, 'loweredAsmStream'>;

// --- Phase handoff: merge lowering output with finalization inputs ---
/**
 * Combine lowering output with placement/fixup inputs. `lowered` is the typed handoff from
 * the lowering phase; `env` holds shared refs (maps, diagnostics, helpers) held across phases.
 */
export function mergeEmitFinalizationContext(
  lowered: EmitLoweringPhaseResult,
  env: EmitFinalizationPhaseEnv,
): EmitPlacementPhaseContext {
  return { ...lowered, ...env };
}

/** Deterministic empty result when compilation aborts before lowering (e.g. no source files). */
export function emitProgramEmptyResult(): EmitProgramResult {
  return {
    map: { bytes: new Map() },
    symbols: [],
    loweredAsmStream: { blocks: [] },
    placedLoweredAsmProgram: { blocks: [] },
  };
}

// --- Phase 2: prescan (ops) ---
/** Phase 2 — prescan: build op candidate maps and alias metadata before emission. */
export function runEmitPrescanPhase(ctx: EmitPrescanPhaseContext): EmitPrescanPhaseResult {
  return preScanProgramDeclarations(ctx);
}

// --- Phase 3: lowering (emit bytes, fixups, lowered ASM stream) ---
/** Phase 3 — lowering: emit declarations and instruction streams into placement bytes and fixup queues. */
export function runEmitLoweringPhase(
  ctx: EmitLoweringPhaseContext,
  prescan: EmitPrescanPhaseResult,
): EmitLoweringPhaseResult {
  return lowerProgramDeclarations({ ...ctx, prescan });
}

// --- Phase 4: finalization (placement, fixups, artifact assembly) ---
/** Phase 4 — placement, fixups, merged map and placed lowered ASM. */
export function runEmitPlacementAndArtifactPhase(
  context: EmitPlacementPhaseContext,
): EmitPlacementPhaseResult {
  return finalizeEmitProgram(context);
}
