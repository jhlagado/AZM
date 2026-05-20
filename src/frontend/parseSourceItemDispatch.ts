import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceItemNode, SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import type { LogicalLine } from './parseLogicalLines.js';
import { parseAsmTopLevel } from './parseAsmTopLevel.js';
import type { PendingRawLabel } from './parseRawDataDirectives.js';
import { topLevelStartKeyword } from './parseTopLevelCommon.js';
import { recoverUnsupportedParserLine } from './parseParserRecovery.js';
import { stripLineComment as stripComment } from './parseParserShared.js';
import type { SourceFile } from './source.js';

export type ParseItemContext = {
  scope: 'source';
  asmEnded?: boolean;
  asmPendingRawLabel?: PendingRawLabel;
};

export type ParseItemResult = {
  nextIndex: number;
  node?: SourceItemNode;
  nodes?: SourceItemNode[];
};

export type RawSourceLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

export type ParseSourceItemDispatchArgs = {
  index: number;
  lineNo: number;
  filePath: string;
  text: string;
  rest: string;
  stmtSpan: SourceSpan;
  lineStartOffset: number;
  ctx: ParseItemContext;
};

type ParseSourceItemDispatchHandler = (
  args: ParseSourceItemDispatchArgs,
) => ParseItemResult | undefined;

export type SourceItemDispatchTable = Readonly<
  Partial<Record<string, ParseSourceItemDispatchHandler>>
>;

type DispatchSourceItemContext = {
  aliasPolicy?: DirectiveAliasPolicy;
  diagnostics: Diagnostic[];
  file: SourceFile;
  getRawLine: (lineIndex: number) => RawSourceLine;
  logicalLines: LogicalLine[];
  sourceItemDispatchTable: SourceItemDispatchTable;
  sourcePath: string;
  asmStringEquates: Map<string, string>;
  span: typeof import('./source.js').span;
};

export function dispatchSourceItem(
  index: number,
  ctx: ParseItemContext,
  dispatchContext: DispatchSourceItemContext,
): ParseItemResult {
  const {
    aliasPolicy,
    diagnostics,
    file,
    getRawLine,
    logicalLines,
    sourceItemDispatchTable,
    sourcePath,
    asmStringEquates,
    span,
  } = dispatchContext;
  const { raw, startOffset: lineStartOffset, endOffset: lineEndOffset } = getRawLine(index);
  const text = stripComment(raw).trim();
  const lineNo = logicalLines[index]?.lineNo ?? index + 1;
  const filePath = logicalLines[index]?.filePath ?? sourcePath;

  if (text.length === 0) return { nextIndex: index + 1 };

  const rest = text;
  const stmtSpan = span(file, lineStartOffset, lineEndOffset);

  const parsedAsm = parseAsmTopLevel({
    index,
    filePath,
    lineNo,
    rest,
    stmtSpan,
    diagnostics,
    ctx,
    ...(aliasPolicy ? { aliasPolicy } : {}),
    asmStringEquates,
  });
  if (parsedAsm) return parsedAsm;

  const dispatchKeyword = topLevelStartKeyword(rest);
  const dispatchHandler =
    dispatchKeyword === undefined ? undefined : sourceItemDispatchTable[dispatchKeyword];
  if (dispatchHandler) {
    const parsed = dispatchHandler({
      index,
      lineNo,
      filePath,
      text,
      rest,
      stmtSpan,
      lineStartOffset,
      ctx,
    });
    if (parsed) return parsed;
  }

  return recoverUnsupportedParserLine({
    index,
    scope: ctx.scope,
    text,
    rest,
    lineNo,
    filePath,
    diagnostics,
  });
}
