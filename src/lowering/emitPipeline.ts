/**
 * Emit orchestration phases for `emitProgram`.
 *
 * Pipeline (conceptual):
 *
 * 1. **Workspace setup** — lives in `emit.ts`: section byte maps, fixup queues, visibility,
 *    resolution helpers, and the program-lowering context (`createEmitProgramContext`). This
 *    phase wires mutable state and callbacks; it does not traverse the whole program yet.
 *
 * 2. **Prescan** — `runEmitPrescanPhase`: discover callables, ops, storage aliases, and
 *    raw-address names so later lowering can resolve symbols. Product: {@link PrescanResult}.
 *
 * 3. **Lowering** — `runEmitLoweringPhase`: traverse declarations and functions, emit bytes
 *    into section maps, enqueue fixups. Product: {@link LoweringResult}.
 *
 * 4. **Placement & artifacts** — `runEmitPlacementAndArtifactPhase`: named-section placement,
 *    fixup resolution, merged `EmittedByteMap`, symbol table, placed lowered-ASM program.
 *    Input: {@link EmitFinalizationContext} (built via {@link mergeEmitFinalizationContext}).
 *
 * Format writers stay in `compile.ts` / `PipelineDeps`; this module only produces the
 * in-memory products they consume.
 */

import type { EmittedByteMap, SymbolEntry } from '../formats/types.js';
import type { NonBankedSectionKeyCollection } from '../sectionKeys.js';
import type { OpStackPolicyMode } from '../pipeline.js';
import { finalizeEmitProgram, type EmitFinalizationContext } from './emitFinalization.js';
import type { LoweredAsmProgram, LoweredAsmStream } from './loweredAsmTypes.js';
import type { PrescanResult } from './prescanTypes.js';
import {
  lowerProgramDeclarations,
  preScanProgramDeclarations,
  type Context as ProgramLoweringContext,
  type LoweringResult,
  type PrescanContext,
} from './programLowering.js';

export type EmitPrescanPhaseContext = PrescanContext;
export type EmitPrescanPhaseResult = PrescanResult;
export type EmitLoweringPhaseContext = ProgramLoweringContext;

export interface EmitLoweringPhaseResult {
  /** Next code section allocation offset after lowering. */
  readonly codeOffset: LoweringResult['codeOffset'];
  /** Next data section offset. */
  readonly dataOffset: LoweringResult['dataOffset'];
  /** Next var section offset. */
  readonly varOffset: LoweringResult['varOffset'];
  /** Symbols still pending resolution. */
  readonly pending: LoweringResult['pending'];
  /** Emitted symbol table entries. */
  readonly symbols: LoweringResult['symbols'];
  /** Absolute-address symbols. */
  readonly absoluteSymbols: LoweringResult['absoluteSymbols'];
  /** Deferred extern fixup metadata. */
  readonly deferredExterns: LoweringResult['deferredExterns'];
  /** Emitted code bytes map. */
  readonly codeBytes: LoweringResult['codeBytes'];
  /** Emitted data bytes map. */
  readonly dataBytes: LoweringResult['dataBytes'];
  /** Emitted hex-derived bytes map. */
  readonly hexBytes: LoweringResult['hexBytes'];
}

/** Options for `emitProgram` (include paths, policy flags, listing sources). */
export type EmitProgramOptions = {
  /** Extra include directories for `include` / assets; omit for none. */
  includeDirs?: string[];
  /** Stack policy for op bodies; omit defaults to `off`. */
  opStackPolicy?: OpStackPolicyMode;
  /** Enable raw typed call warnings when true. */
  rawTypedCallWarnings?: boolean;
  /** Default code load address for placement; omit uses pipeline default. */
  defaultCodeBase?: number;
  /** Named section key collection for placement; omit when not used. */
  namedSectionKeys?: NonBankedSectionKeyCollection;
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
  /** Lowered asm after placement (named sections applied). */
  placedLoweredAsmProgram: LoweredAsmProgram;
};

/** Finalization inputs that come from phase-1 wiring rather than phase-3 lowering. */
export interface EmitFinalizationPhaseEnv {
  /** Named section sinks from phase 1 helpers. */
  readonly namedSectionSinks: EmitFinalizationContext['namedSectionSinks'];
  /** Shared diagnostics buffer. */
  readonly diagnostics: EmitFinalizationContext['diagnostics'];
  /** File-level diagnostic helper. */
  readonly diag: EmitFinalizationContext['diag'];
  /** Span-level diagnostic helper. */
  readonly diagAt: EmitFinalizationContext['diagAt'];
  /** Primary source path for diagnostics. */
  readonly primaryFile: EmitFinalizationContext['primaryFile'];
  /** Section base imm expressions. */
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
  /** Section alignment helper. */
  readonly alignTo: EmitFinalizationContext['alignTo'];
  /** Writes a section slice into the byte map. */
  readonly writeSection: EmitFinalizationContext['writeSection'];
  /** Computes written byte ranges for overlap checks. */
  readonly computeWrittenRange: EmitFinalizationContext['computeWrittenRange'];
  /** Rebases source map after section moves. */
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

/** Deterministic empty result when compilation aborts before lowering (e.g. no modules). */
export function emitProgramEmptyResult(): EmitProgramResult {
  return {
    map: { bytes: new Map() },
    symbols: [],
    loweredAsmStream: { blocks: [] },
    placedLoweredAsmProgram: { blocks: [] },
  };
}

// --- Phase 2: prescan (callables, ops, storage aliases) ---
/** Phase 2 — prescan: build visibility maps and alias metadata before emission. */
export function runEmitPrescanPhase(ctx: EmitPrescanPhaseContext): EmitPrescanPhaseResult {
  return preScanProgramDeclarations(ctx);
}

// --- Phase 3: lowering (emit bytes, fixups, lowered ASM stream) ---
/** Phase 3 — lowering: emit declarations and functions into section bytes and fixup queues. */
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
