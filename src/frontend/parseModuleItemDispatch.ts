import type { Diagnostic } from '../diagnosticTypes.js';
import type { ModuleItemNode, SourceSpan } from './ast.js';
import type { DirectiveAliasPolicy } from './directiveAliases.js';
import type { LogicalLine } from './parseLogicalLines.js';
import { parseAzmNativeTopLevel } from './parseAzmNativeTopLevel.js';
import type { PendingRawLabel } from './parseRawDataDirectives.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { topLevelStartKeyword } from './parseModuleCommon.js';
import { recoverUnsupportedParserLine } from './parseParserRecovery.js';
import { stripLineComment as stripComment } from './parseParserShared.js';
import { looksLikeRawDataDirectiveStart } from './parseRawDataDirectiveStart.js';
import type { SourceFile } from './source.js';

export type ParseItemContext = {
  scope: 'module';
  azmPendingRawLabel?: PendingRawLabel;
};

export type ParseItemResult = {
  nextIndex: number;
  node?: ModuleItemNode;
  nodes?: ModuleItemNode[];
};

export type RawModuleLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

export type ParseModuleItemDispatchArgs = {
  index: number;
  lineNo: number;
  filePath: string;
  text: string;
  rest: string;
  stmtSpan: SourceSpan;
  lineStartOffset: number;
  ctx: ParseItemContext;
};

type ParseModuleItemDispatchHandler = (
  args: ParseModuleItemDispatchArgs,
) => ParseItemResult | undefined;

export type ModuleItemDispatchTable = Readonly<
  Partial<Record<string, ParseModuleItemDispatchHandler>>
>;

type DispatchModuleItemContext = {
  aliasPolicy?: DirectiveAliasPolicy;
  diagnostics: Diagnostic[];
  file: SourceFile;
  getRawLine: (lineIndex: number) => RawModuleLine;
  logicalLines: LogicalLine[];
  moduleItemDispatchTable: ModuleItemDispatchTable;
  modulePath: string;
  nativeMode: boolean;
  span: typeof import('./source.js').span;
};

export function dispatchModuleItem(
  index: number,
  ctx: ParseItemContext,
  dispatchContext: DispatchModuleItemContext,
): ParseItemResult {
  const {
    aliasPolicy,
    diagnostics,
    file,
    getRawLine,
    logicalLines,
    moduleItemDispatchTable,
    modulePath,
    nativeMode,
    span,
  } = dispatchContext;
  const { raw, startOffset: lineStartOffset, endOffset: lineEndOffset } = getRawLine(index);
  const text = stripComment(raw).trim();
  const lineNo = logicalLines[index]?.lineNo ?? index + 1;
  const filePath = logicalLines[index]?.filePath ?? modulePath;

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
      `Raw data directives are only permitted inside data sections.`,
      { line: lineNo, column: 1 },
    );
    return { nextIndex: index + 1 };
  }

  const dispatchKeyword = topLevelStartKeyword(rest);
  const dispatchHandler =
    dispatchKeyword === undefined ? undefined : moduleItemDispatchTable[dispatchKeyword];
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
