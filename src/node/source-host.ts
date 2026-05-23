import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';

import type { Diagnostic } from '../model/diagnostic.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { createSourceFile } from '../source/source-file.js';
import { scanLogicalLines } from '../source/logical-lines.js';

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
  const includeDirs = (options.includeDirs ?? []).map((path) => normalize(path));
  const lines = await expandFile({
    sourcePath: entryFile,
    includeDirs,
    sourceTexts,
    sourceLineComments,
    diagnostics,
    includeStack: [],
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
  readonly preloadedText?: string;
  readonly signal?: AbortSignal;
  readonly includeStack: readonly string[];
}

async function expandFile(options: ExpandFileOptions): Promise<LogicalLine[] | undefined> {
  options.signal?.throwIfAborted();
  const sourcePath = normalize(options.sourcePath);
  if (options.includeStack.includes(sourcePath)) {
    options.diagnostics.push({
      severity: 'error',
      code: 'AZMN_SOURCE',
      message: `recursive include: ${sourcePath}`,
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
    const includePath = parseIncludePath(line.text);
    if (!includePath) {
      output.push(line);
      continue;
    }

    const result = await resolveInclude(sourcePath, includePath, options.includeDirs);
    if (result.resolved === undefined) {
      options.diagnostics.push({
        severity: 'error',
        code: 'AZMN_SOURCE',
        message: `Failed to resolve include "${includePath}" from "${sourcePath}". Tried:\n${result.searchCandidates.map((candidate) => `- ${candidate}`).join('\n')}`,
        sourceName: sourcePath,
        line: line.line,
        column: firstColumn(line.text),
      });
      continue;
    }

    const { preloadedText: _preloadedText, ...includeOptions } = options;
    const included = await expandFile({
      ...includeOptions,
      sourcePath: result.resolved,
      includeStack: [...options.includeStack, sourcePath],
    });
    if (included !== undefined) {
      output.push(...included);
    }
  }
  return output;
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

async function resolveInclude(
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

function parseIncludePath(text: string): string | undefined {
  const match = /^\.?include\s+"([^"]+)"\s*$/i.exec(stripComment(text).trim());
  return match?.[1];
}

function stripComment(text: string): string {
  const comment = text.indexOf(';');
  return comment === -1 ? text : text.slice(0, comment);
}

function lineComment(text: string): string | undefined {
  const comment = text.indexOf(';');
  if (comment === -1) {
    return undefined;
  }
  const value = text.slice(comment + 1).trim();
  return value.length === 0 ? undefined : value;
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
