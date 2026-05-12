import { computeWrittenRange, rebaseCodeSourceSegments, writeSection } from './sectionLayout.js';
import type { EmitProgramOptions, EmitFinalizationPhaseEnv } from './emitPipeline.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { CompileEnv } from '../semantics/env.js';
import { evalImmExpr } from '../semantics/env.js';
import { alignTo } from './sectionLayout.js';
import { diag, diagAt } from './loweringDiagnostics.js';
import type { EmitPhase1Workspace } from './emitPhase1Workspace.js';
import type { EmitPhase1Helpers } from './emitPhase1Helpers.js';

type EmitFinalizationSetupContext = {
  /** Semantic environment for imm evaluation during finalization. */
  env: CompileEnv;
  /** Mutable diagnostic sink for placement and fixup phases. */
  diagnostics: Diagnostic[];
  /** Optional emit knobs (code base, etc.); omit when defaults apply. */
  options?: EmitProgramOptions;
  /** Phase-1 workspace carrying bytes, fixups, and lowered asm stream. */
  workspace: EmitPhase1Workspace;
  /** Phase-1 helpers (named section sinks, lowered asm) wired into finalization. */
  helpers: EmitPhase1Helpers;
};

export function buildEmitFinalizationPhaseEnv(ctx: EmitFinalizationSetupContext): EmitFinalizationPhaseEnv {
  return {
    namedSectionSinks: ctx.helpers.namedSectionSinks,
    diagnostics: ctx.diagnostics,
    diag,
    diagAt,
    primaryFile: ctx.workspace.config.primaryFile,
    baseExprs: ctx.workspace.storage.baseExprs,
    evalImmExpr,
    env: ctx.env,
    loweredAsmStream: ctx.helpers.loweredAsmStream,
    fixups: ctx.workspace.symbols.fixups,
    rel8Fixups: ctx.workspace.symbols.rel8Fixups,
    bytes: ctx.workspace.emission.bytes,
    codeSourceSegments: ctx.workspace.emission.codeSourceSegments,
    alignTo,
    writeSection,
    computeWrittenRange,
    rebaseCodeSourceSegments,
    ...(ctx.options?.defaultCodeBase !== undefined
      ? { defaultCodeBase: ctx.options.defaultCodeBase }
      : {}),
  };
}
