import type { Diagnostic } from '../diagnosticTypes.js';
import { consumeTopKeyword } from './parseTopLevelCommon.js';
import { parseEnumDecl } from './parseEnum.js';
import { parseTopLevelOpDecl } from './parseOp.js';
import { parseTypeDecl, parseUnionDecl } from './parseTypes.js';
import type { LogicalLine } from './parseLogicalLines.js';
import type { SourceFile } from './source.js';
import type {
  SourceItemDispatchTable,
  ParseItemResult,
  ParseSourceItemDispatchArgs,
  RawSourceLine,
} from './parseSourceItemDispatch.js';

type CreateSourceItemTableContext = {
  diagnostics: Diagnostic[];
  file: SourceFile;
  getRawLine: (lineIndex: number) => RawSourceLine;
  isReservedTopLevelName: (name: string) => boolean;
  lineCount: number;
  logicalLines: LogicalLine[];
  sourcePath: string;
  parseOpParamsFromText: typeof import('./parseParams.js').parseOpParamsFromText;
};

export function createSourceItemTable(ctx: CreateSourceItemTableContext) {
  const {
    diagnostics,
    file,
    getRawLine,
    isReservedTopLevelName,
    lineCount,
    logicalLines: _logicalLines,
    parseOpParamsFromText,
  } = ctx;

  function parseTypeItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseSourceItemDispatchArgs): ParseItemResult {
    const typeTail = consumeTopKeyword(rest, 'type') ?? '';
    const parsedType = parseTypeDecl(typeTail, text, stmtSpan, lineNo, index, {
      file,
      lineCount,
      diagnostics,
      sourcePath: filePath,
      getRawLine,
      isReservedTopLevelName,
    });
    if (!parsedType) return { nextIndex: index + 1 };
    return { nextIndex: parsedType.nextIndex, node: parsedType.node };
  }

  function parseUnionItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseSourceItemDispatchArgs): ParseItemResult {
    const unionTail = consumeTopKeyword(rest, 'union') ?? '';
    const parsedUnion = parseUnionDecl(unionTail, text, stmtSpan, lineNo, index, {
      file,
      lineCount,
      diagnostics,
      sourcePath: filePath,
      getRawLine,
      isReservedTopLevelName,
    });
    if (!parsedUnion) return { nextIndex: index + 1 };
    return { nextIndex: parsedUnion.nextIndex, node: parsedUnion.node };
  }

  function parseOpItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseSourceItemDispatchArgs): ParseItemResult {
    const opTail = consumeTopKeyword(rest, 'op') ?? '';
    const parsedOp = parseTopLevelOpDecl(opTail, text, stmtSpan, lineNo, index, {
      file,
      lineCount,
      diagnostics,
      sourcePath: filePath,
      getRawLine,
      isReservedTopLevelName,
      parseOpParamsFromText,
    });
    if (!parsedOp) return { nextIndex: index + 1 };
    return { nextIndex: parsedOp.nextIndex, node: parsedOp.node };
  }

  function parseEnumItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseSourceItemDispatchArgs): ParseItemResult {
    const enumTail = consumeTopKeyword(rest, 'enum') ?? '';
    const enumNode = parseEnumDecl(enumTail, {
      diagnostics,
      sourcePath: filePath,
      lineNo,
      text,
      span: stmtSpan,
      isReservedTopLevelName,
    });
    return { nextIndex: index + 1, ...(enumNode ? { node: enumNode } : {}) };
  }

  return {
    type: parseTypeItem,
    union: parseUnionItem,
    op: parseOpItem,
    enum: parseEnumItem,
  } as SourceItemDispatchTable;
}
