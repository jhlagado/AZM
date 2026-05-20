import type { Diagnostic } from '../diagnosticTypes.js';
import type { ProgramNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import {
  emitProgramEmptyResult,
  mergeEmitFinalizationContext,
  runEmitLoweringPhase,
  runEmitPlacementAndArtifactPhase,
  runEmitPrescanPhase,
  type EmitProgramOptions,
  type EmitProgramResult,
} from './emitPipeline.js';
import { diag } from './loweringDiagnostics.js';
import { createEmitPhase1Workspace } from './emitPhase1Workspace.js';
import { createEmitPhase1Helpers } from './emitPhase1Helpers.js';
import { buildEmitFinalizationPhaseEnv } from './emitFinalizationSetup.js';

/**
 * Emit machine-code bytes for a parsed program into an address->byte map.
 *
 * Orchestration follows the phased pipeline in `emitPipeline.ts`. Phase 1 (workspace wiring)
 * is implemented in this file; phases 2–4 use `runEmitPrescanPhase`, `runEmitLoweringPhase`,
 * and `runEmitPlacementAndArtifactPhase`.
 *
 * Implementation notes:
 * - Uses code and data byte maps while lowering, then merges them during placement.
 * - `.org` and `.align` move the current assembler placement.
 * - Detects overlapping byte emissions across the final address map.
 */
export function emitProgram(
  program: ProgramNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  options?: EmitProgramOptions,
): EmitProgramResult {
  const firstSourceFile = program.files[0];
  if (!firstSourceFile) {
    diag(diagnostics, program.entryFile, 'No source files to compile.');
    return emitProgramEmptyResult();
  }
  const workspace = createEmitPhase1Workspace(program, env, options);
  const phase1 = createEmitPhase1Helpers({
    program,
    env,
    diagnostics,
    workspace,
    ...(options !== undefined ? { options } : {}),
  });

  // --- Phase 2: prescan (visibility / alias metadata) ---
  const prescan = runEmitPrescanPhase(phase1.programLoweringContext);
  // --- Phase 3: lowering (bytes + fixup queues) ---
  const lowered = runEmitLoweringPhase(phase1.programLoweringContext, prescan);

  phase1.flushTrailingUserComments();

  // --- Phase 4: placement, fixup resolution, merged `EmittedByteMap` ---
  const finalized = runEmitPlacementAndArtifactPhase(
    mergeEmitFinalizationContext(
      lowered,
      buildEmitFinalizationPhaseEnv({
        env,
        diagnostics,
        workspace,
        helpers: phase1,
        ...(options !== undefined ? { options } : {}),
      }),
    ),
  );
  return { ...finalized, loweredAsmStream: phase1.loweredAsmStream };
}

export type { EmitProgramOptions, EmitProgramResult } from './emitPipeline.js';
