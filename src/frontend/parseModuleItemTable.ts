import type { Diagnostic } from '../diagnosticTypes.js';
import { consumeTopKeyword } from './parseModuleCommon.js';
import { parseEnumDecl } from './parseEnum.js';
import { parseTopLevelOpDecl } from './parseOp.js';
import { parseTypeDecl, parseUnionDecl } from './parseTypes.js';
import {
  parseAlignDirectiveDecl,
  parseBinDecl,
  parseConstDecl,
  parseHexDecl,
} from './parseTopLevelSimple.js';
import type { LogicalLine } from './parseLogicalLines.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import type { SourceFile } from './source.js';
import type {
  ModuleItemDispatchTable,
  ParseItemResult,
  ParseModuleItemDispatchArgs,
  RawModuleLine,
} from './parseModuleItemDispatch.js';

type CreateModuleItemTableContext = {
  diagnostics: Diagnostic[];
  file: SourceFile;
  getRawLine: (lineIndex: number) => RawModuleLine;
  isReservedTopLevelName: (name: string) => boolean;
  lineCount: number;
  logicalLines: LogicalLine[];
  modulePath: string;
  parseOpParamsFromText: typeof import('./parseParams.js').parseOpParamsFromText;
};

export function createModuleItemTable(ctx: CreateModuleItemTableContext) {
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
    hasExportPrefix,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const typeTail = consumeTopKeyword(rest, 'type') ?? '';
    const parsedType = parseTypeDecl(
      typeTail,
      text,
      stmtSpan,
      lineNo,
      index,
      {
        file,
        lineCount,
        diagnostics,
        modulePath: filePath,
        getRawLine,
        isReservedTopLevelName,
      },
      hasExportPrefix,
    );
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
    hasExportPrefix,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const unionTail = consumeTopKeyword(rest, 'union') ?? '';
    const parsedUnion = parseUnionDecl(
      unionTail,
      text,
      stmtSpan,
      lineNo,
      index,
      {
        file,
        lineCount,
        diagnostics,
        modulePath: filePath,
        getRawLine,
        isReservedTopLevelName,
      },
      hasExportPrefix,
    );
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
    hasExportPrefix,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const opTail = consumeTopKeyword(rest, 'op') ?? '';
    const parsedOp = parseTopLevelOpDecl(
      opTail,
      text,
      stmtSpan,
      lineNo,
      index,
      hasExportPrefix,
      {
        file,
        lineCount,
        diagnostics,
        modulePath: filePath,
        getRawLine,
        isReservedTopLevelName,
        parseOpParamsFromText,
      },
    );
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
    hasExportPrefix,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const enumTail = consumeTopKeyword(rest, 'enum') ?? '';
    const enumNode = parseEnumDecl(
      enumTail,
      {
        diagnostics,
        modulePath: filePath,
        lineNo,
        text,
        span: stmtSpan,
        isReservedTopLevelName,
      },
      hasExportPrefix,
    );
    return { nextIndex: index + 1, ...(enumNode ? { node: enumNode } : {}) };
  }

  function parseAlignItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const alignTail = consumeTopKeyword(rest, 'align') ?? '';
    const alignNode = parseAlignDirectiveDecl(rest, alignTail, {
      diagnostics,
      modulePath: filePath,
      lineNo,
      text,
      span: stmtSpan,
      isReservedTopLevelName,
    });
    return { nextIndex: index + 1, ...(alignNode ? { node: alignNode } : {}) };
  }

  function parseConstItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
    hasExportPrefix,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const constTail = consumeTopKeyword(rest, 'const') ?? '';
    const constNode = parseConstDecl(constTail, hasExportPrefix, {
      diagnostics,
      modulePath: filePath,
      lineNo,
      text,
      span: stmtSpan,
      isReservedTopLevelName,
    });
    return { nextIndex: index + 1, ...(constNode ? { node: constNode } : {}) };
  }

  function parseBinItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const binTail = consumeTopKeyword(rest, 'bin') ?? '';
    const node = parseBinDecl(binTail, {
      diagnostics,
      modulePath: filePath,
      lineNo,
      text,
      span: stmtSpan,
      isReservedTopLevelName,
    });
    return { nextIndex: index + 1, ...(node ? { node } : {}) };
  }

  function parseHexItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const hexTail = consumeTopKeyword(rest, 'hex') ?? '';
    const node = parseHexDecl(hexTail, {
      diagnostics,
      modulePath: filePath,
      lineNo,
      text,
      span: stmtSpan,
      isReservedTopLevelName,
    });
    return { nextIndex: index + 1, ...(node ? { node } : {}) };
  }

  return {
    type: parseTypeItem,
    union: parseUnionItem,
    op: parseOpItem,
    enum: parseEnumItem,
    align: parseAlignItem,
    const: parseConstItem,
    bin: parseBinItem,
    hex: parseHexItem,
  } as ModuleItemDispatchTable;
}
