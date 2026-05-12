import type { Diagnostic } from './diagnosticTypes.js';
import { analyzeLoadedProgram, type AnalyzeProgramOptions, type AnalyzeProgramResult } from './analysis.js';
import { loadProgram as loadProgramInternal, type LoadedProgram, type LoadProgramOptions } from './moduleLoader.js';

export type { Diagnostic, DiagnosticId, DiagnosticSeverity } from './diagnosticTypes.js';
export { DiagnosticIds } from './diagnosticTypes.js';
export type {
  BaseNode,
  ModuleFileNode,
  ModuleItemNode,
  ProgramNode,
  SectionItemNode,
  SourcePosition,
  SourceSpan,
} from './frontend/ast.js';
export type { CompileEnv } from './semantics/env.js';
export type { LoadedProgram, LoadProgramOptions, AnalyzeProgramOptions, AnalyzeProgramResult };

export interface ToolingLoadProgramResult {
  diagnostics: Diagnostic[];
  loadedProgram?: LoadedProgram;
}

/**
 * Layer A: resolve imports/includes and parse the program tree without emitting artifacts.
 */
export async function loadProgram(options: LoadProgramOptions & { entryFile: string }): Promise<ToolingLoadProgramResult> {
  const diagnostics: Diagnostic[] = [];
  const loadedProgram = await loadProgramInternal(options.entryFile, diagnostics, options);
  return {
    diagnostics,
    ...(loadedProgram ? { loadedProgram } : {}),
  };
}

/**
 * Layer B: run semantic checks without lowering or writing output artifacts.
 */
export function analyzeProgram(
  loadedProgram: LoadedProgram,
  options: AnalyzeProgramOptions = {},
): AnalyzeProgramResult {
  return analyzeLoadedProgram(loadedProgram, options);
}
