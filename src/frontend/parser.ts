import type {
  ModuleFileNode,
  ModuleItemNode,
  ProgramNode,
} from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { buildLogicalLines, getLogicalLine, type LogicalLine } from './parseLogicalLines.js';
import {
  dispatchModuleItem,
  type ParseItemContext,
  type ParseItemResult,
} from './parseModuleItemDispatch.js';
import { createModuleItemTable } from './parseModuleItemTable.js';
import { parseOpParamsFromText } from './parseParams.js';
import { isReservedTopLevelDeclName } from './parseParserShared.js';
import { makeSourceFile, span, type SourceFile } from './source.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';

/**
 * Parse a single AZM module file from an in-memory source string.
 *
 * Implementation note:
 * - Parsing is best-effort: on errors, diagnostics are appended and parsing continues.
 */
export function parseModuleFile(
  modulePath: string,
  sourceText: string,
  diagnostics: Diagnostic[],
  sourceFileOverride?: SourceFile,
  aliasPolicy?: DirectiveAliasPolicy,
): ModuleFileNode {
  const file = sourceFileOverride ?? makeSourceFile(modulePath, sourceText);
  const logicalLines: LogicalLine[] = buildLogicalLines(file, modulePath, diagnostics);
  const lineCount = logicalLines.length;

  function getRawLine(lineIndex: number): {
    raw: string;
    startOffset: number;
    endOffset: number;
    lineNo: number;
    filePath: string;
  } {
    const logical = getLogicalLine(logicalLines, lineIndex, modulePath);
    return {
      raw: logical.raw,
      startOffset: logical.startOffset,
      endOffset: logical.endOffset,
      lineNo: logical.lineNo,
      filePath: logical.filePath,
    };
  }

  const items: ModuleItemNode[] = [];

  function isReservedTopLevelName(name: string): boolean {
    return isReservedTopLevelDeclName(name);
  }

  const moduleItemDispatchTable = createModuleItemTable({
    diagnostics,
    file,
    getRawLine,
    isReservedTopLevelName,
    lineCount,
    logicalLines,
    modulePath,
    parseOpParamsFromText,
  });

  function parseModuleItem(index: number, ctx: ParseItemContext): ParseItemResult {
    return dispatchModuleItem(index, ctx, {
      diagnostics,
      file,
      getRawLine,
      logicalLines,
      moduleItemDispatchTable,
      modulePath,
      ...(aliasPolicy ? { aliasPolicy } : {}),
      span,
    });
  }

  const moduleCtx: ParseItemContext = { scope: 'module' };
  let i = 0;
  while (i < lineCount) {
    const parsed = parseModuleItem(i, moduleCtx);
    if (parsed.nodes) items.push(...(parsed.nodes as ModuleItemNode[]));
    else if (parsed.node) items.push(parsed.node as ModuleItemNode);
    i = parsed.nextIndex;
  }

  const moduleSpan = span(file, 0, sourceText.length);
  const moduleFile: ModuleFileNode = {
    kind: 'ModuleFile',
    span: moduleSpan,
    path: modulePath,
    moduleId: modulePath,
    items,
  };

  return moduleFile;
}

/**
 * Parse an AZM program from a single in-memory source file.
 */
export function parseProgram(
  entryFile: string,
  sourceText: string,
  diagnostics: Diagnostic[],
): ProgramNode {
  const moduleFile = parseModuleFile(entryFile, sourceText, diagnostics);
  const moduleSpan = moduleFile.span;
  const program: ProgramNode = {
    kind: 'Program',
    span: moduleSpan,
    entryFile,
    files: [moduleFile],
  };

  return program;
}
