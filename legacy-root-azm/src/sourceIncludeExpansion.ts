import { readFile } from 'node:fs/promises';

import { normalizePath } from './compileShared.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import type { DirectiveAliasPolicy } from './frontend/directiveAliases.js';
import { resolveDirectiveAlias } from './frontend/directiveAliases.js';
import { stripLineComment } from './frontend/parseParserShared.js';
import { resolveIncludeCandidates } from './sourceIncludePaths.js';

export type ExpandedSource = {
  text: string;
  lineFiles: string[];
  lineBaseLines: number[];
};

const INCLUDE_DIRECTIVE_RE = /^\s*([.]?[A-Za-z][A-Za-z0-9_]*)\b\s+"([^"]+)"\s*$/i;

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function isIgnorableIncludeProbeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function includeDirectiveForLine(
  raw: string,
  aliasPolicy?: DirectiveAliasPolicy,
): string | undefined {
  const stripped = stripLineComment(raw).trim();
  const match = INCLUDE_DIRECTIVE_RE.exec(stripped);
  if (!match) return undefined;
  return resolveDirectiveAlias(match[1]!, aliasPolicy) === '.include' ? match[2] : undefined;
}

async function resolveIncludeSource(
  sourcePath: string,
  rawLine: string,
  spec: string,
  lineNo: number,
  includeDirs: string[],
  diagnostics: Diagnostic[],
  sourceTexts: Map<string, string>,
  signal?: AbortSignal,
): Promise<{ resolved: string; resolvedText: string } | 'hard-failure' | undefined> {
  const candidates = resolveIncludeCandidates(sourcePath, spec, includeDirs);

  for (const c of candidates) {
    throwIfAborted(signal);
    try {
      const resolvedText = await readFile(c, 'utf8');
      const resolvedKey = normalizePath(c);
      if (!sourceTexts.has(resolvedKey)) sourceTexts.set(resolvedKey, resolvedText);
      return { resolved: c, resolvedText };
    } catch (err) {
      if (isIgnorableIncludeProbeError(err)) continue;
      diagnostics.push({
        id: DiagnosticIds.IoReadFailed,
        severity: 'error',
        message: `Failed to read include candidate "${c}" while resolving includes for "${sourcePath}": ${String(
          err,
        )}`,
        file: sourcePath,
        line: lineNo,
        column: rawLine.indexOf('include') + 1 || 1,
      });
      return 'hard-failure';
    }
  }

  diagnostics.push({
    id: DiagnosticIds.IncludeNotFound,
    severity: 'error',
    message: `Failed to resolve include "${spec}" from "${sourcePath}". Tried:\n${candidates
      .map((c) => `- ${c}`)
      .join('\n')}`,
    file: sourcePath,
    line: lineNo,
    column: rawLine.indexOf('include') + 1 || 1,
  });
  return undefined;
}

export async function expandTextIncludesForFile(args: {
  sourcePath: string;
  sourceText: string;
  includeDirs: string[];
  diagnostics: Diagnostic[];
  sourceTexts: Map<string, string>;
  includeStack: string[];
  aliasPolicy?: DirectiveAliasPolicy;
  signal?: AbortSignal;
}): Promise<ExpandedSource | undefined> {
  const {
    sourcePath,
    sourceText,
    includeDirs,
    diagnostics,
    sourceTexts,
    includeStack,
    aliasPolicy,
    signal,
  } = args;
  const sourceKey = normalizePath(sourcePath);
  if (!sourceTexts.has(sourceKey)) sourceTexts.set(sourceKey, sourceText);
  const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  const lineFiles: string[] = [];
  const lineBaseLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    throwIfAborted(signal);
    const raw = lines[i] ?? '';
    const lineNo = i + 1;
    const spec = includeDirectiveForLine(raw, aliasPolicy);
    if (!spec) {
      out.push(raw);
      lineFiles.push(sourcePath);
      lineBaseLines.push(lineNo);
      continue;
    }

    const resolvedInclude = await resolveIncludeSource(
      sourcePath,
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
      lineFiles.push(sourcePath);
      lineBaseLines.push(lineNo);
      continue;
    }

    if (includeStack.includes(resolvedInclude.resolved)) {
      diagnostics.push({
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: `Include cycle detected: "${resolvedInclude.resolved}" is already active in the include stack.`,
        file: sourcePath,
        line: lineNo,
        column: raw.indexOf('include') + 1 || 1,
      });
      out.push(raw);
      lineFiles.push(sourcePath);
      lineBaseLines.push(lineNo);
      continue;
    }

    const expanded = await expandTextIncludesForFile({
      sourcePath: resolvedInclude.resolved,
      sourceText: resolvedInclude.resolvedText,
      includeDirs,
      diagnostics,
      sourceTexts,
      includeStack: [...includeStack, resolvedInclude.resolved],
      ...(aliasPolicy ? { aliasPolicy } : {}),
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
