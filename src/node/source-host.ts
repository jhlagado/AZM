import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';

import type { Diagnostic } from '../model/diagnostic.js';
import type { LogicalLine, SourceRelation } from '../source/logical-lines.js';
import { createSourceFile } from '../source/source-file.js';
import { scanLogicalLines } from '../source/logical-lines.js';
import { stripLineComment } from '../source/strip-line-comment.js';

export interface LoadProgramNextOptions {
  readonly entryFile: string;
  readonly includeDirs?: readonly string[];
  readonly directiveAliasFiles?: readonly string[];
  readonly preloadedText?: string;
  readonly signal?: AbortSignal;
}

export interface ExpandedNextSource {
  readonly entryFile: string;
  readonly lines: readonly LogicalLine[];
  readonly sourceTexts: ReadonlyMap<string, string>;
  readonly sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>;
}

export async function expandSourceForTooling(options: LoadProgramNextOptions): Promise<{
  readonly diagnostics: readonly Diagnostic[];
  readonly expanded?: ExpandedNextSource;
}> {
  const diagnostics: Diagnostic[] = [];
  const entryFile = normalize(options.entryFile);
  const extension = extname(entryFile).toLowerCase();
  if (extension !== '.asm' && extension !== '.z80') {
    diagnostics.push({
      severity: 'error',
      code: 'AZMN_SOURCE',
      message: 'unsupported source file extension (expected .asm or .z80)',
      sourceName: entryFile,
    });
    return { diagnostics };
  }

  const sourceTexts = new Map<string, string>();
  const sourceLineComments = new Map<string, Map<number, string>>();
  const loadedImports = new Set<string>();
  const includeDirs = (options.includeDirs ?? []).map((path) => normalize(path));
  const lines = await expandFile({
    sourcePath: entryFile,
    includeDirs,
    sourceTexts,
    sourceLineComments,
    diagnostics,
    loadedImports,
    sourceStack: [],
    sourceUnit: entryFile,
    sourceRelation: 'entry',
    ...(options.preloadedText !== undefined ? { preloadedText: options.preloadedText } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || lines === undefined) {
    return { diagnostics };
  }
  return { diagnostics, expanded: { entryFile, lines, sourceTexts, sourceLineComments } };
}

interface ExpandFileOptions {
  readonly sourcePath: string;
  readonly includeDirs: readonly string[];
  readonly sourceTexts: Map<string, string>;
  readonly sourceLineComments: Map<string, Map<number, string>>;
  readonly diagnostics: Diagnostic[];
  readonly loadedImports: Set<string>;
  readonly preloadedText?: string;
  readonly signal?: AbortSignal;
  readonly sourceStack: readonly SourceStackEntry[];
  readonly sourceUnit: string;
  readonly sourceRelation: SourceRelation;
}

interface SourceStackEntry {
  readonly sourcePath: string;
}

interface SourceLoadDirective {
  readonly kind: 'include' | 'import';
  readonly path: string;
}

async function expandFile(options: ExpandFileOptions): Promise<LogicalLine[] | undefined> {
  options.signal?.throwIfAborted();
  const sourcePath = normalize(options.sourcePath);
  if (options.sourceStack.some((entry) => entry.sourcePath === sourcePath)) {
    options.diagnostics.push({
      severity: 'error',
      code: 'AZMN_SOURCE',
      message: `recursive ${options.sourceRelation}: ${sourcePath}`,
      sourceName: sourcePath,
    });
    return undefined;
  }

  const text = await readSourceText(options, sourcePath);
  if (text === undefined) {
    return undefined;
  }
  options.sourceTexts.set(sourcePath, text);

  const output: LogicalLine[] = [];
  for (const line of scanLogicalLines(createSourceFile(sourcePath, text))) {
    recordLineComment(options.sourceLineComments, line);
    const directive = parseSourceLoadDirective(line.text);
    if (!directive) {
      output.push(withSourceOwnership(line, options.sourceUnit, options.sourceRelation));
      continue;
    }

    const result = await resolveSourcePath(sourcePath, directive.path, options.includeDirs);
    if (result.resolved === undefined) {
      options.diagnostics.push({
        severity: 'error',
        code: 'AZMN_SOURCE',
        message: `Failed to resolve ${directive.kind} "${directive.path}" from "${sourcePath}". Tried:\n${result.searchCandidates.map((candidate) => `- ${candidate}`).join('\n')}`,
        sourceName: sourcePath,
        line: line.line,
        column: firstColumn(line.text),
      });
      continue;
    }

    if (directive.kind === 'import' && options.loadedImports.has(result.resolved)) {
      continue;
    }
    if (directive.kind === 'import') {
      options.loadedImports.add(result.resolved);
    }

    const { preloadedText: _preloadedText, ...includeOptions } = options;
    const included = await expandFile({
      ...includeOptions,
      sourcePath: result.resolved,
      sourceStack: [...options.sourceStack, { sourcePath }],
      sourceUnit: directive.kind === 'import' ? result.resolved : options.sourceUnit,
      sourceRelation: directive.kind,
    });
    if (included !== undefined) {
      output.push(...included);
    }
  }
  return output;
}

function withSourceOwnership(
  line: LogicalLine,
  sourceUnit: string,
  sourceRelation: SourceRelation,
): LogicalLine {
  return {
    ...line,
    sourceUnit,
    sourceRelation,
  };
}

function recordLineComment(comments: Map<string, Map<number, string>>, line: LogicalLine): void {
  const commentText = lineComment(line.text);
  if (commentText === undefined) {
    return;
  }
  let sourceComments = comments.get(line.sourceName);
  if (!sourceComments) {
    sourceComments = new Map();
    comments.set(line.sourceName, sourceComments);
  }
  sourceComments.set(line.line, commentText);
}

async function readSourceText(
  options: ExpandFileOptions,
  sourcePath: string,
): Promise<string | undefined> {
  if (options.preloadedText !== undefined) {
    return options.preloadedText;
  }
  try {
    return await readFile(sourcePath, 'utf8');
  } catch (error) {
    options.diagnostics.push({
      severity: 'error',
      code: 'AZMN_SOURCE',
      message: `failed to read source file: ${String(error)}`,
      sourceName: sourcePath,
    });
    return undefined;
  }
}

async function resolveSourcePath(
  importer: string,
  includePath: string,
  includeDirs: readonly string[],
): Promise<{ resolved?: string; searchCandidates: readonly string[] }> {
  const candidates = [
    join(dirname(importer), includePath),
    ...includeDirs.map((dir) => join(dir, includePath)),
  ];
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8');
      return { resolved: normalize(candidate), searchCandidates: candidates.map(normalize) };
    } catch {
      continue;
    }
  }
  return { searchCandidates: candidates.map(normalize) };
}

function parseSourceLoadDirective(text: string): SourceLoadDirective | undefined {
  const trimmed = stripLineComment(text).trim();
  const include = /^\.?include\s+"([^"]+)"\s*$/i.exec(trimmed);
  if (include) {
    return { kind: 'include', path: include[1] ?? '' };
  }
  const sourceImport = /^\.import\s+"([^"]+)"\s*$/.exec(trimmed);
  if (sourceImport) {
    return { kind: 'import', path: sourceImport[1] ?? '' };
  }
  return undefined;
}

function lineComment(text: string): string | undefined {
  const prefix = stripLineComment(text);
  if (prefix.length === text.length) {
    return undefined;
  }
  const value = text.slice(prefix.length + 1).trim();
  return value.length === 0 ? undefined : value;
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
