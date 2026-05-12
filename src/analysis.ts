import { dirname } from 'node:path';

import { hasErrors } from './compileShared.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import type { LoadedProgram } from './moduleLoader.js';
import type { CompilerOptions } from './pipeline.js';
import { lintCaseStyle } from './lintCaseStyle.js';
import type { ModuleItemNode, ProgramNode, SectionItemNode } from './frontend/ast.js';
import { validateAssignmentAcceptance } from './semantics/assignmentAcceptance.js';
import { buildEnv, type CompileEnv } from './semantics/env.js';
import { validateStepAcceptance } from './semantics/stepAcceptance.js';

export interface AnalyzeProgramOptions
  extends Pick<CompilerOptions, 'caseStyle' | 'requireMain'> {}

export interface AnalyzeProgramResult {
  diagnostics: Diagnostic[];
  env?: CompileEnv;
}

function hasMainFunction(program: ProgramNode): boolean {
  const hasMainInItems = (items: Array<ModuleItemNode | SectionItemNode>): boolean => {
    for (const item of items) {
      if (item.kind === 'FuncDecl' && item.name.toLowerCase() === 'main') return true;
      if (item.kind === 'NamedSection' && item.section === 'code' && hasMainInItems(item.items)) return true;
    }
    return false;
  };
  return program.files.some((moduleFile) => hasMainInItems(moduleFile.items));
}

export function analyzeLoadedProgram(
  loadedProgram: LoadedProgram,
  options: AnalyzeProgramOptions = {},
): AnalyzeProgramResult {
  const diagnostics: Diagnostic[] = [];
  const { program, sourceTexts, resolvedImportGraph } = loadedProgram;
  const hasNonImportDeclaration = program.files.some((moduleFile) =>
    moduleFile.items.some((item) => item.kind !== 'Import'),
  );
  if (!hasNonImportDeclaration) {
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
      message: 'Program must define a callable "main" entry function.',
      file: program.entryFile,
      ...(program.span?.start
        ? { line: program.span.start.line, column: program.span.start.column }
        : {}),
    });
    return { diagnostics };
  }

  lintCaseStyle(program, sourceTexts, options.caseStyle ?? 'off', diagnostics);

  const env = buildEnv(program, diagnostics, {
    moduleIdRootDir: dirname(program.entryFile),
    resolvedImportGraph,
  });
  if (hasErrors(diagnostics)) return { diagnostics };

  validateAssignmentAcceptance(program, env, diagnostics);
  if (hasErrors(diagnostics)) return { diagnostics };

  validateStepAcceptance(program, env, diagnostics);
  if (hasErrors(diagnostics)) return { diagnostics };

  return { diagnostics, env };
}
