import type {
  ModuleFileNode,
  ModuleItemNode,
  ProgramNode,
  SectionItemNode,
} from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { canonicalModuleId } from '../moduleIdentity.js';
import { buildLogicalLines, getLogicalLine, type LogicalLine } from './parseLogicalLines.js';
import {
  createModuleItemDispatchTable,
  dispatchModuleItem,
  type ParseItemContext,
  type ParseItemResult,
} from './parseModuleItemDispatch.js';
import { parseSectionItems as parseSectionItemsFromHelper } from './parseSectionBodies.js';
import { parseSectionHeader } from './parseSectionHeader.js';
import { parseOpParamsFromText, parseParamsFromText } from './parseParams.js';
import { isReservedTopLevelDeclName } from './parseParserShared.js';
import { makeSourceFile, span, type SourceFile } from './source.js';

/**
 * Parse a single `.zax` module file from an in-memory source string.
 *
 * Implementation note:
 * - Parsing is best-effort: on errors, diagnostics are appended and parsing continues.
 * - The module may include `import` statements, but import resolution/loading is handled by the compiler.
 */
export function parseModuleFile(
  modulePath: string,
  sourceText: string,
  diagnostics: Diagnostic[],
  sourceFileOverride?: SourceFile,
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

  function parseSectionItems(startIndex: number, sectionKind: 'code' | 'data'): {
    items: SectionItemNode[];
    nextIndex: number;
    closed: boolean;
  } {
    return parseSectionItemsFromHelper({
      startIndex,
      lineCount,
      sectionKind,
      diagnostics,
      parseModuleItem: (index, ctx) => parseModuleItem(index, ctx),
    });
  }

  function isReservedTopLevelName(name: string): boolean {
    return isReservedTopLevelDeclName(name);
  }

  const moduleItemDispatchTable = createModuleItemDispatchTable({
    diagnostics,
    file,
    getRawLine,
    isReservedTopLevelName,
    lineCount,
    logicalLines,
    modulePath,
    parseSectionHeader: (sectionText, sectionSpan, lineNo, originalText, filePath) =>
      parseSectionHeader({
        sectionText,
        sectionSpan,
        lineNo,
        originalText,
        filePath,
        diagnostics,
        isReservedTopLevelName,
      }),
    parseOpParamsFromText,
    parseParamsFromText,
    parseSectionItems,
    span,
  });

  function parseModuleItem(index: number, ctx: ParseItemContext): ParseItemResult {
    return dispatchModuleItem(index, ctx, {
      diagnostics,
      file,
      getRawLine,
      logicalLines,
      moduleItemDispatchTable,
      modulePath,
      span,
    });
  }

  let i = 0;
  while (i < lineCount) {
    const parsed = parseModuleItem(i, { scope: 'module' });
    if (parsed.node) items.push(parsed.node as ModuleItemNode);
    i = parsed.nextIndex;
  }

  const moduleSpan = span(file, 0, sourceText.length);
  const moduleFile: ModuleFileNode = {
    kind: 'ModuleFile',
    span: moduleSpan,
    path: modulePath,
    moduleId: canonicalModuleId(modulePath),
    items,
  };

  return moduleFile;
}

/**
 * Parse a ZAX program from a single in-memory source file.
 *
 * Note: this helper parses only the entry module. Import resolution/loading is handled by the compiler.
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
