import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { hasErrors, normalizePath } from './compileShared.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import type { ModuleFileNode, ProgramNode } from './frontend/ast.js';
import { parseClassicModuleFile } from './frontend/asm80/parseClassicModule.js';
import { parseModuleFile } from './frontend/parser.js';
import { stripLineComment } from './frontend/parseParserShared.js';
import { makeSourceFile } from './frontend/source.js';
import { inferSourceMode, type SourceMode } from './frontend/sourceMode.js';
import { canonicalModuleId } from './moduleIdentity.js';
import {
  importTargets,
  resolveImportCandidates,
  resolveIncludeCandidates,
} from './moduleLoaderIncludePaths.js';
import type { CompilerOptions } from './pipeline.js';

function isIgnorableImportProbeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export type LoadedProgram = {
  program: ProgramNode;
  sourceTexts: Map<string, string>;
  sourceLineComments: Map<string, Map<number, string>>;
  moduleTraversal: string[];
  resolvedImportGraph: Map<string, string[]>;
};

export interface LoadProgramOptions extends Pick<CompilerOptions, 'includeDirs' | 'sourceMode'> {
  preloadedText?: string;
  signal?: AbortSignal;
}

type ExpandedSource = { text: string; lineFiles: string[]; lineBaseLines: number[] };
type ModuleEdges = Map<string, Map<string, { line: number; column: number }>>;
type ImportTarget = ReturnType<typeof importTargets>[number];

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function includeDirectiveForLine(raw: string, sourceMode: SourceMode): string | undefined {
  const stripped = stripLineComment(raw).trim();
  const match =
    sourceMode === 'asm80'
      ? /^\s*\.include\s+"([^"]+)"\s*$/i.exec(stripped)
      : /^\s*include\s+"([^"]+)"\s*$/.exec(stripped);
  return match?.[1];
}

async function readModuleSource(
  modulePath: string,
  diagnostics: Diagnostic[],
  importer?: string,
  preloadedText?: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  throwIfAborted(signal);
  try {
    return preloadedText ?? (await readFile(modulePath, 'utf8'));
  } catch (err) {
    diagnostics.push({
      id: DiagnosticIds.IoReadFailed,
      severity: 'error',
      message: importer
        ? `Failed to read imported module "${modulePath}" (imported by "${importer}"): ${String(err)}`
        : `Failed to read entry file: ${String(err)}`,
      file: importer ?? modulePath,
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

async function resolveIncludeSource(
  modulePath: string,
  rawLine: string,
  spec: string,
  lineNo: number,
  includeDirs: string[],
  diagnostics: Diagnostic[],
  sourceTexts: Map<string, string>,
  signal?: AbortSignal,
): Promise<{ resolved: string; resolvedText: string } | 'hard-failure' | undefined> {
  const candidates = resolveIncludeCandidates(modulePath, spec, includeDirs);

  for (const c of candidates) {
    throwIfAborted(signal);
    try {
      const resolvedText = await readFile(c, 'utf8');
      const resolvedKey = normalizePath(c);
      if (!sourceTexts.has(resolvedKey)) sourceTexts.set(resolvedKey, resolvedText);
      return { resolved: c, resolvedText };
    } catch (err) {
      if (isIgnorableImportProbeError(err)) continue;
      diagnostics.push({
        id: DiagnosticIds.IoReadFailed,
        severity: 'error',
        message: `Failed to read include candidate "${c}" while resolving includes for "${modulePath}": ${String(
          err,
        )}`,
        file: modulePath,
        line: lineNo,
        column: rawLine.indexOf('include') + 1 || 1,
      });
      return 'hard-failure';
    }
  }

  diagnostics.push({
    id: DiagnosticIds.ImportNotFound,
    severity: 'error',
    message: `Failed to resolve include "${spec}" from "${modulePath}". Tried:\n${candidates
      .map((c) => `- ${c}`)
      .join('\n')}`,
    file: modulePath,
    line: lineNo,
    column: rawLine.indexOf('include') + 1 || 1,
  });
  return undefined;
}

async function expandIncludesForFile(args: {
  modulePath: string;
  sourceText: string;
  sourceMode: SourceMode;
  includeDirs: string[];
  diagnostics: Diagnostic[];
  sourceTexts: Map<string, string>;
  includeStack: string[];
  signal?: AbortSignal;
}): Promise<ExpandedSource | undefined> {
  const {
    modulePath,
    sourceText,
    sourceMode,
    includeDirs,
    diagnostics,
    sourceTexts,
    includeStack,
    signal,
  } = args;
  const moduleKey = normalizePath(modulePath);
  if (!sourceTexts.has(moduleKey)) sourceTexts.set(moduleKey, sourceText);
  const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  const lineFiles: string[] = [];
  const lineBaseLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    throwIfAborted(signal);
    const raw = lines[i] ?? '';
    const lineNo = i + 1;
    const spec = includeDirectiveForLine(raw, sourceMode);
    if (!spec) {
      out.push(raw);
      lineFiles.push(modulePath);
      lineBaseLines.push(lineNo);
      continue;
    }

    const resolvedInclude = await resolveIncludeSource(
      modulePath,
      raw,
      spec,
      lineNo,
      includeDirs,
      diagnostics,
      sourceTexts,
      signal,
    );
    if (resolvedInclude === 'hard-failure') return undefined;
    if (!resolvedInclude) {
      out.push(raw);
      lineFiles.push(modulePath);
      lineBaseLines.push(lineNo);
      continue;
    }

    if (includeStack.includes(resolvedInclude.resolved)) {
      diagnostics.push({
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: `Include cycle detected: "${resolvedInclude.resolved}" is already active in the include stack.`,
        file: modulePath,
        line: lineNo,
        column: raw.indexOf('include') + 1 || 1,
      });
      out.push(raw);
      lineFiles.push(modulePath);
      lineBaseLines.push(lineNo);
      continue;
    }

    const expanded = await expandIncludesForFile({
      modulePath: resolvedInclude.resolved,
      sourceText: resolvedInclude.resolvedText,
      sourceMode,
      includeDirs,
      diagnostics,
      sourceTexts,
      includeStack: [...includeStack, resolvedInclude.resolved],
      ...(signal ? { signal } : {}),
    });
    if (expanded === undefined) return undefined;

    const expandedLines = expanded.text.split('\n');
    for (let j = 0; j < expandedLines.length; j++) {
      out.push(expandedLines[j]!);
      lineFiles.push(expanded.lineFiles[j] ?? resolvedInclude.resolved);
      lineBaseLines.push(expanded.lineBaseLines[j] ?? j + 1);
    }
  }

  return { text: out.join('\n'), lineFiles, lineBaseLines };
}

function parseExpandedModuleFile(
  modulePath: string,
  expanded: ExpandedSource,
  diagnostics: Diagnostic[],
  sourceMode: SourceMode,
): ModuleFileNode | undefined {
  if (sourceMode === 'asm80') {
    const sourceFile = makeSourceFile(modulePath, expanded.text);
    sourceFile.lineFiles = expanded.lineFiles;
    sourceFile.lineBaseLines = expanded.lineBaseLines;
    return parseClassicModuleFile(modulePath, expanded.text, diagnostics, sourceFile);
  }

  try {
    const sourceFile = makeSourceFile(modulePath, expanded.text);
    sourceFile.lineFiles = expanded.lineFiles;
    sourceFile.lineBaseLines = expanded.lineBaseLines;
    return parseModuleFile(modulePath, expanded.text, diagnostics, sourceFile);
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

async function resolveImportSource(
  modulePath: string,
  imp: ImportTarget,
  includeDirs: string[],
  diagnostics: Diagnostic[],
  signal?: AbortSignal,
): Promise<{ resolved: string; resolvedText: string } | 'hard-failure' | undefined> {
  const candidates = resolveImportCandidates(modulePath, imp, includeDirs);

  for (const c of candidates) {
    throwIfAborted(signal);
    try {
      return { resolved: c, resolvedText: await readFile(c, 'utf8') };
    } catch (err) {
      if (isIgnorableImportProbeError(err)) continue;
      diagnostics.push({
        id: DiagnosticIds.IoReadFailed,
        severity: 'error',
        message: `Failed to read import candidate "${c}" while resolving imports for "${modulePath}": ${String(
          err,
        )}`,
        file: modulePath,
        line: imp.span.start.line,
        column: imp.span.start.column,
      });
      return 'hard-failure';
    }
  }

  const pretty = imp.form === 'path' ? `"${imp.specifier}"` : imp.specifier;
  diagnostics.push({
    id: DiagnosticIds.ImportNotFound,
    severity: 'error',
    message: `Failed to resolve import ${pretty} from "${modulePath}". Tried:\n${candidates
      .map((c) => `- ${c}`)
      .join('\n')}`,
    file: modulePath,
    line: imp.span.start.line,
    column: imp.span.start.column,
  });
  return undefined;
}

function recordImportEdge(
  edges: ModuleEdges,
  modulePath: string,
  resolved: string,
  imp: ImportTarget,
): void {
  const moduleEdges = edges.get(modulePath)!;
  if (!moduleEdges.has(resolved)) {
    moduleEdges.set(resolved, {
      line: imp.span.start.line,
      column: imp.span.start.column,
    });
  }
}

function validateCanonicalModuleIds(
  modules: Map<string, ModuleFileNode>,
  moduleIdRootDir: string,
  diagnostics: Diagnostic[],
): boolean {
  const idSeen = new Map<string, string>();
  for (const modulePath of modules.keys()) {
    const id = canonicalModuleId(modulePath, moduleIdRootDir);
    const loweredId = id.toLowerCase();
    const prev = idSeen.get(loweredId);
    if (prev && prev !== modulePath) {
      const moduleSpan = modules.get(modulePath)?.span.start;
      diagnostics.push({
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: `Module ID collision: "${id}" maps to both "${prev}" and "${modulePath}".`,
        file: modulePath,
        ...(moduleSpan !== undefined ? { line: moduleSpan.line, column: moduleSpan.column } : {}),
      });
    } else {
      idSeen.set(loweredId, modulePath);
    }
  }
  return !hasErrors(diagnostics);
}

function topologicallyOrderModules(
  entryPath: string,
  edges: ModuleEdges,
  moduleIdRootDir: string,
  diagnostics: Diagnostic[],
): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  const sortKey = (modulePath: string) =>
    `${canonicalModuleId(modulePath, moduleIdRootDir).toLowerCase()}\n${modulePath}`;

  const visit = (modulePath: string, stack: string[], fromModule?: string): void => {
    if (visited.has(modulePath)) return;
    if (visiting.has(modulePath)) {
      const cycleStart = stack.indexOf(modulePath);
      const cycle =
        cycleStart >= 0 ? stack.slice(cycleStart).concat([modulePath]) : stack.concat([modulePath]);
      const edge = fromModule ? edges.get(fromModule)?.get(modulePath) : undefined;
      diagnostics.push({
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: `Import cycle detected: ${cycle.join(' -> ')}`,
        file: fromModule ?? entryPath,
        ...(edge !== undefined ? { line: edge.line, column: edge.column } : {}),
      });
      return;
    }

    visiting.add(modulePath);
    const deps = Array.from((edges.get(modulePath) ?? new Map()).keys()).sort((a, b) =>
      sortKey(a).localeCompare(sortKey(b)),
    );
    for (const dep of deps) {
      visit(dep, stack.concat([modulePath]), modulePath);
      if (hasErrors(diagnostics)) return;
    }
    visiting.delete(modulePath);
    visited.add(modulePath);
    order.push(modulePath);
  };

  visit(entryPath, []);
  if (hasErrors(diagnostics)) return undefined;
  return order;
}

function collectModuleTraversal(entryPath: string, edges: ModuleEdges): string[] {
  const traversalVisited = new Set<string>();
  const moduleTraversal: string[] = [];

  const walkTraversal = (modulePath: string): void => {
    if (traversalVisited.has(modulePath)) return;
    traversalVisited.add(modulePath);
    moduleTraversal.push(modulePath);
    for (const dep of (edges.get(modulePath) ?? new Map()).keys()) {
      walkTraversal(dep);
    }
  };

  walkTraversal(entryPath);
  return moduleTraversal;
}

export async function loadProgram(
  entryFile: string,
  diagnostics: Diagnostic[],
  options: LoadProgramOptions,
): Promise<LoadedProgram | undefined> {
  const entryPath = normalizePath(entryFile);
  const modules = new Map<string, ModuleFileNode>();
  const sourceTexts = new Map<string, string>();
  const sourceLineComments = new Map<string, Map<number, string>>();
  const edges = new Map<string, Map<string, { line: number; column: number }>>();
  const includeDirs = (options.includeDirs ?? []).map(normalizePath);
  const moduleIdRootDir = dirname(entryPath);
  const signal = options.signal;
  const explicitSourceMode = options.sourceMode;

  const loadModule = async (
    modulePath: string,
    importer?: string,
    preloadedText?: string,
  ): Promise<void> => {
    throwIfAborted(signal);
    const p = normalizePath(modulePath);
    if (modules.has(p)) return;

    const sourceText = await readModuleSource(p, diagnostics, importer, preloadedText, signal);
    if (sourceText === undefined) return;
    if (!sourceTexts.has(p)) sourceTexts.set(p, sourceText);
    const sourceMode = explicitSourceMode ?? inferSourceMode(p);
    const expanded = await expandIncludesForFile({
      modulePath: p,
      sourceText,
      sourceMode,
      includeDirs,
      diagnostics,
      sourceTexts,
      includeStack: [p],
      ...(signal ? { signal } : {}),
    });
    if (expanded === undefined) return;

    const moduleFile = parseExpandedModuleFile(p, expanded, diagnostics, sourceMode);
    if (!moduleFile) return;
    modules.set(p, moduleFile);
    recordSourceLineComments(sourceLineComments, expanded);
    edges.set(p, new Map());

    for (const imp of importTargets(moduleFile)) {
      const resolvedImport = await resolveImportSource(p, imp, includeDirs, diagnostics, signal);
      if (resolvedImport === 'hard-failure') return;
      if (!resolvedImport) continue;

      recordImportEdge(edges, p, resolvedImport.resolved, imp);
      await loadModule(resolvedImport.resolved, p, resolvedImport.resolvedText);
    }
  };

  await loadModule(entryPath, undefined, options.preloadedText);
  if (hasErrors(diagnostics)) return undefined;

  if (!validateCanonicalModuleIds(modules, moduleIdRootDir, diagnostics)) return undefined;

  const order = topologicallyOrderModules(entryPath, edges, moduleIdRootDir, diagnostics);
  if (!order) return undefined;

  const moduleFiles = order.map((p) => modules.get(p)!).filter(Boolean);
  const entryModule = modules.get(entryPath);
  if (!entryModule) return undefined;

  return {
    program: { kind: 'Program', span: entryModule.span, entryFile: entryPath, files: moduleFiles },
    sourceTexts,
    sourceLineComments,
    moduleTraversal: collectModuleTraversal(entryPath, edges),
    resolvedImportGraph: new Map(
      Array.from(edges.entries(), ([modulePath, moduleEdges]) => [
        modulePath,
        Array.from(moduleEdges.keys()),
      ]),
    ),
  };
}
