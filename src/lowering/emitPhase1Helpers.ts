import { buildEmitProgramLoweringContext } from './emitPhase1BuildProgramLoweringContext.js';
import type { EmitPhase1Helpers, EmitPhase1HelpersContext } from './emitPhase1Types.js';
import { wireEmitPhase1Helpers } from './emitPhase1WirePipeline.js';

export type { EmitPhase1Helpers, EmitPhase1HelpersContext } from './emitPhase1Types.js';

/** Wires emit phase 1 helpers and program lowering context (see #1317). */
export function createEmitPhase1Helpers(ctx: EmitPhase1HelpersContext): EmitPhase1Helpers {
  const wire = wireEmitPhase1Helpers(ctx);
  const programLoweringContext = buildEmitProgramLoweringContext(ctx, wire);
  return {
    flushTrailingUserComments: wire.flushTrailingUserComments,
    loweredAsmStream: ctx.workspace.emission.loweredAsmStream,
    programLoweringContext,
    namedSectionSinks: wire.namedSectionSinks,
  };
}
