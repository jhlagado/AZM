import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceItemNode, SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import type { LogicalLine } from './parseLogicalLines.js';
import { parseAzmNativeTopLevel } from './parseAzmNativeTopLevel.js';
import type { PendingRawLabel } from './parseRawDataDirectives.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { topLevelStartKeyword } from './parseTopLevelCommon.js';
import { recoverUnsupportedParserLine } from './parseParserRecovery.js';
import { stripLineComment as stripComment } from './parseParserShared.js';
import { looksLikeRawDataDirectiveStart } from './parseRawDataDirectiveStart.js';
import type { SourceFile } from './source.js';

export type ParseItemContext = {
  scope: 'source';
  azmPendingRawLabel?: PendingRawLabel;
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
  nativeMode: boolean;
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
    nativeMode,
    span,
  } = dispatchContext;
  const { raw, startOffset: lineStartOffset, endOffset: lineEndOffset } = getRawLine(index);
  const text = stripComment(raw).trim();
  const lineNo = logicalLines[index]?.lineNo ?? index + 1;
  const filePath = logicalLines[index]?.filePath ?? sourcePath;

  if (text.length === 0) return { nextIndex: index + 1 };

  const rest = text;
  const stmtSpan = span(file, lineStartOffset, lineEndOffset);

  if (nativeMode) {
    const parsedNative = parseAzmNativeTopLevel({
      index,
      filePath,
      lineNo,
      rest,
      stmtSpan,
      diagnostics,
      ctx,
      ...(aliasPolicy ? { aliasPolicy } : {}),
    });
    if (parsedNative) return parsedNative;
  }

  if (looksLikeRawDataDirectiveStart(rest) && !nativeMode) {
    diag(
      diagnostics,
      filePath,
      `Raw data directives are only supported in .asm source; use labels plus .db/.dw/.ds.`,
      { line: lineNo, column: 1 },
    );
    return { nextIndex: index + 1 };
  }

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
