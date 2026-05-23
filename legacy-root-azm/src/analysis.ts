import { hasErrors } from './compileShared.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import type { LoadedProgram } from './sourceLoader.js';
import type { CompilerOptions } from './pipeline.js';
import { lintCaseStyle } from './lintCaseStyle.js';
import type { ProgramNode } from './frontend/ast.js';
import { buildEnv, type CompileEnv } from './semantics/env.js';

export interface AnalyzeProgramOptions extends Pick<CompilerOptions, 'caseStyle' | 'requireMain'> {}

export interface AnalyzeProgramResult {
  diagnostics: Diagnostic[];
  env?: CompileEnv;
}

function hasMainEntryLabel(program: ProgramNode): boolean {
  return program.files.some((sourceFile) =>
    sourceFile.items.some((item) => item.kind === 'AsmLabel' && item.name.toLowerCase() === 'main'),
  );
}

export function analyzeLoadedProgram(
  loadedProgram: LoadedProgram,
  options: AnalyzeProgramOptions = {},
): AnalyzeProgramResult {
  const diagnostics: Diagnostic[] = [];
  const { program, sourceTexts } = loadedProgram;
  const hasProgramItems = program.files.some((sourceFile) => sourceFile.items.length > 0);
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

  if ((options.requireMain ?? false) && !hasMainEntryLabel(program)) {
    diagnostics.push({
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Program must define a "main" entry label.',
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

  return { diagnostics, env };
}
