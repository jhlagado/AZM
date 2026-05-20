import { hasErrors } from './compileShared.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import type { LoadedProgram } from './moduleLoader.js';
import type { CompilerOptions } from './pipeline.js';
import { lintCaseStyle } from './lintCaseStyle.js';
import type { ProgramNode } from './frontend/ast.js';
import { buildEnv, type CompileEnv } from './semantics/env.js';
import { validateStepAcceptance } from './semantics/stepAcceptance.js';

export interface AnalyzeProgramOptions
  extends Pick<CompilerOptions, 'caseStyle' | 'requireMain'> {}

export interface AnalyzeProgramResult {
  diagnostics: Diagnostic[];
  env?: CompileEnv;
}

function hasMainFunction(program: ProgramNode): boolean {
  return program.files.some((moduleFile) =>
    moduleFile.items.some((item) => item.kind === 'AsmLabel' && item.name.toLowerCase() === 'main'),
  );
}

export function analyzeLoadedProgram(
  loadedProgram: LoadedProgram,
  options: AnalyzeProgramOptions = {},
): AnalyzeProgramResult {
  const diagnostics: Diagnostic[] = [];
  const { program, sourceTexts } = loadedProgram;
  const hasProgramItems = program.files.some((moduleFile) => moduleFile.items.length > 0);
  if (!hasProgramItems) {
    diagnostics.push({
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Program contains no declarations or instruction streams.',
      file: program.entryFile,
      ...(program.span?.start
        ? { line: program.span.start.line, column: program.span.start.column }
        : {}),
    });
    return { diagnostics };
  }

  if ((options.requireMain ?? false) && !hasMainFunction(program)) {
    diagnostics.push({
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Program must define a callable "main" entry point.',
      file: program.entryFile,
      ...(program.span?.start
        ? { line: program.span.start.line, column: program.span.start.column }
        : {}),
    });
    return { diagnostics };
  }

  lintCaseStyle(program, sourceTexts, options.caseStyle ?? 'off', diagnostics);

  const env = buildEnv(program, diagnostics);
  if (hasErrors(diagnostics)) return { diagnostics };

  validateStepAcceptance(program, env, diagnostics);
  if (hasErrors(diagnostics)) return { diagnostics };

  return { diagnostics, env };
}
