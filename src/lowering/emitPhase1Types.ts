import type { ProgramNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { EmitProgramOptions } from './emitPipeline.js';
import type { EmitPhase1Workspace } from './emitPhase1Workspace.js';

type EmitProgramContextResult = ReturnType<
  typeof import('./emitProgramContext.js').createEmitProgramContext
>;
type EmitStateHelpersResult = ReturnType<typeof import('./emitState.js').createEmitStateHelpers>;

/** Inputs for emit phase 1 helper wiring (program lowering + asm recording). */
export type EmitPhase1HelpersContext = {
  program: ProgramNode;
  env: CompileEnv;
  diagnostics: Diagnostic[];
  options?: EmitProgramOptions;
  workspace: EmitPhase1Workspace;
};

/** Public surface returned from {@link createEmitPhase1Helpers}. */
export type EmitPhase1Helpers = {
  flushTrailingUserComments: () => void;
  loweredAsmStream: EmitPhase1Workspace['emission']['loweredAsmStream'];
  programLoweringContext: EmitProgramContextResult['programLoweringContext'];
  namedSectionSinks: EmitStateHelpersResult['namedSectionSinks'];
};
