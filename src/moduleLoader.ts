import { readFile } from 'node:fs/promises';

import { hasErrors, normalizePath } from './compileShared.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import type { ModuleFileNode, ProgramNode } from './frontend/ast.js';
import { parseClassicModuleFile } from './frontend/asm80/parseClassicModule.js';
import type { DirectiveAliasPolicy } from './frontend/directiveAliases.js';
import {
  buildDirectiveAliasPolicy,
  defaultDirectiveAliasProfileName,
} from './frontend/directiveAliases.js';
import { parseModuleFile } from './frontend/parser.js';
import { makeSourceFile } from './frontend/source.js';
import { inferSourceMode, type SourceMode } from './frontend/sourceMode.js';
import { expandTextIncludesForFile, type ExpandedSource } from './sourceIncludeExpansion.js';
import type { CompilerOptions } from './pipeline.js';

export type LoadedProgram = {
  program: ProgramNode;
  sourceTexts: Map<string, string>;
  sourceLineComments: Map<string, Map<number, string>>;
};

export interface LoadProgramOptions extends Pick<CompilerOptions, 'includeDirs' | 'sourceMode'> {
  directiveAliasPolicy?: DirectiveAliasPolicy;
  preloadedText?: string;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

async function readSourceFileText(
  sourcePath: string,
  diagnostics: Diagnostic[],
  importer?: string,
  preloadedText?: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  throwIfAborted(signal);
  try {
    return preloadedText ?? (await readFile(sourcePath, 'utf8'));
  } catch (err) {
    diagnostics.push({
      id: DiagnosticIds.IoReadFailed,
      severity: 'error',
      message: importer
        ? `Failed to read included source file "${sourcePath}" (included by "${importer}"): ${String(err)}`
        : `Failed to read entry file: ${String(err)}`,
      file: importer ?? sourcePath,
    });
    return undefined;
  }
}

function recordSourceLineComments(
  sourceLineComments: Map<string, Map<number, string>>,
  expanded: ExpandedSource,
): void {
  const lines = expanded.text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const semi = line.indexOf(';');
    if (semi < 0) continue;
    const commentText = line.slice(semi + 1).trim();
    if (!commentText) continue;
    const fileRaw = expanded.lineFiles[i];
    if (!fileRaw) continue;
    const file = normalizePath(fileRaw);
    const lineNo = expanded.lineBaseLines[i] ?? i + 1;
    let lineMap = sourceLineComments.get(file);
    if (!lineMap) {
      lineMap = new Map();
      sourceLineComments.set(file, lineMap);
    }
    lineMap.set(lineNo, commentText);
  }
}

function parseExpandedModuleFile(
  modulePath: string,
  expanded: ExpandedSource,
  diagnostics: Diagnostic[],
  sourceMode: SourceMode,
  aliasPolicy?: DirectiveAliasPolicy,
): ModuleFileNode | undefined {
  if (sourceMode === 'asm80') {
    const sourceFile = makeSourceFile(modulePath, expanded.text);
    sourceFile.lineFiles = expanded.lineFiles;
    sourceFile.lineBaseLines = expanded.lineBaseLines;
    return parseClassicModuleFile(modulePath, expanded.text, diagnostics, sourceFile, aliasPolicy);
  }

  try {
    const sourceFile = makeSourceFile(modulePath, expanded.text);
    sourceFile.lineFiles = expanded.lineFiles;
    sourceFile.lineBaseLines = expanded.lineBaseLines;
    return parseModuleFile(modulePath, expanded.text, diagnostics, sourceFile, aliasPolicy, true);
  } catch (err) {
    diagnostics.push({
      id: DiagnosticIds.InternalParseError,
      severity: 'error',
      message: `Internal error during parse: ${String(err)}`,
      file: modulePath,
    });
    return undefined;
  }
}

export async function loadProgram(
  entryFile: string,
  diagnostics: Diagnostic[],
  options: LoadProgramOptions,
): Promise<LoadedProgram | undefined> {
  const entryPath = normalizePath(entryFile);
  const sourceTexts = new Map<string, string>();
  const sourceLineComments = new Map<string, Map<number, string>>();
  const includeDirs = (options.includeDirs ?? []).map(normalizePath);
  const aliasPolicy =
    options.directiveAliasPolicy ?? buildDirectiveAliasPolicy(defaultDirectiveAliasProfileName());
  const signal = options.signal;
  const explicitSourceMode = options.sourceMode;

  throwIfAborted(signal);
  const sourceText = await readSourceFileText(entryPath, diagnostics, undefined, options.preloadedText, signal);
  if (sourceText === undefined) return undefined;
  sourceTexts.set(entryPath, sourceText);
  const sourceMode = explicitSourceMode ?? inferSourceMode(entryPath);
  if (!sourceMode) {
    diagnostics.push({
      id: DiagnosticIds.Unknown,
      severity: 'error',
      message: 'Unsupported source file extension (expected .asm or .z80)',
      file: entryPath,
    });
    return undefined;
  }
  const expanded = await expandTextIncludesForFile({
    sourcePath: entryPath,
    sourceText,
    includeDirs,
    diagnostics,
    sourceTexts,
    includeStack: [entryPath],
    ...(aliasPolicy ? { aliasPolicy } : {}),
    ...(signal ? { signal } : {}),
  });
  if (expanded === undefined) return undefined;
  if (hasErrors(diagnostics)) return undefined;

  const entryModule = parseExpandedModuleFile(
    entryPath,
    expanded,
    diagnostics,
    sourceMode,
    aliasPolicy,
  );
  if (!entryModule) return undefined;
  recordSourceLineComments(sourceLineComments, expanded);

  return {
    program: {
      kind: 'Program',
      span: entryModule.span,
      entryFile: entryPath,
      sourceMode,
      files: [entryModule],
    },
    sourceTexts,
    sourceLineComments,
  };
}
