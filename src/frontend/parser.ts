import type { SourceFileNode, SourceItemNode, ProgramNode } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { buildLogicalLines, getLogicalLine, type LogicalLine } from './parseLogicalLines.js';
import {
  dispatchSourceItem,
  type ParseItemContext,
  type ParseItemResult,
} from './parseSourceItemDispatch.js';
import { createSourceItemTable } from './parseSourceItemTable.js';
import { parseOpParamsFromText } from './parseParams.js';
import { isReservedTopLevelDeclName } from './parseParserShared.js';
import { makeSourceFile, span, type SourceFile } from './source.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import { parseAsmLine } from './asm80/asmLine.js';
import { parseWholeQuotedString } from './asm80/parseAsmRawValues.js';

/**
 * Parse a single AZM source file from an in-memory source string.
 *
 * Implementation note:
 * - Parsing is best-effort: on errors, diagnostics are appended and parsing continues.
 */
export function parseSourceFile(
  sourcePath: string,
  sourceText: string,
  diagnostics: Diagnostic[],
  sourceFileOverride?: SourceFile,
  aliasPolicy?: DirectiveAliasPolicy,
): SourceFileNode {
  const file = sourceFileOverride ?? makeSourceFile(sourcePath, sourceText);
  const logicalLines: LogicalLine[] = buildLogicalLines(file, sourcePath, diagnostics);
  const lineCount = logicalLines.length;

  function getRawLine(lineIndex: number): {
    raw: string;
    startOffset: number;
    endOffset: number;
    lineNo: number;
    filePath: string;
  } {
    const logical = getLogicalLine(logicalLines, lineIndex, sourcePath);
    return {
      raw: logical.raw,
      startOffset: logical.startOffset,
      endOffset: logical.endOffset,
      lineNo: logical.lineNo,
      filePath: logical.filePath,
    };
  }

  const items: SourceItemNode[] = [];
  const asmStringEquates = new Map<string, string>();

  for (let index = 0; index < lineCount; index++) {
    const line = getRawLine(index);
    const parsed = parseAsmLine(
      line.filePath,
      line.raw,
      line.lineNo,
      line.startOffset,
      aliasPolicy,
    );
    if (parsed?.kind === 'end') break;
    if (parsed?.kind !== 'equ') continue;
    const rawString = parseWholeQuotedString(parsed.exprText);
    if (rawString !== undefined && rawString.length > 1) {
      const name = parsed.name.startsWith('@') ? parsed.name.slice(1) : parsed.name;
      asmStringEquates.set(name.toLowerCase(), rawString);
    }
  }

  function isReservedTopLevelName(name: string): boolean {
    return isReservedTopLevelDeclName(name);
  }

  const sourceItemDispatchTable = createSourceItemTable({
    diagnostics,
    file,
    getRawLine,
    isReservedTopLevelName,
    lineCount,
    logicalLines,
    sourcePath,
    parseOpParamsFromText,
  });

  function parseSourceItem(index: number, ctx: ParseItemContext): ParseItemResult {
    return dispatchSourceItem(index, ctx, {
      diagnostics,
      file,
      getRawLine,
      logicalLines,
      sourceItemDispatchTable,
      sourcePath,
      asmStringEquates,
      ...(aliasPolicy ? { aliasPolicy } : {}),
      span,
    });
  }

  const sourceCtx: ParseItemContext = { scope: 'source' };
  let i = 0;
  while (i < lineCount) {
    const parsed = parseSourceItem(i, sourceCtx);
    if (parsed.nodes) items.push(...(parsed.nodes as SourceItemNode[]));
    else if (parsed.node) items.push(parsed.node as SourceItemNode);
    i = parsed.nextIndex;
  }

  const sourceSpan = span(file, 0, sourceText.length);
  const sourceFileNode: SourceFileNode = {
    kind: 'SourceFile',
    span: sourceSpan,
    path: sourcePath,
    items,
  };

  return sourceFileNode;
}

/**
 * Parse an AZM program from a single in-memory source file.
 */
export function parseProgram(
  entryFile: string,
  sourceText: string,
  diagnostics: Diagnostic[],
): ProgramNode {
  const sourceFileNode = parseSourceFile(entryFile, sourceText, diagnostics);
  const sourceSpan = sourceFileNode.span;
  const program: ProgramNode = {
    kind: 'Program',
    span: sourceSpan,
    entryFile,
    files: [sourceFileNode],
  };

  return program;
}
