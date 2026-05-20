import type { Diagnostic } from '../diagnosticTypes.js';
import { consumeTopKeyword } from './parseModuleCommon.js';
import { parseTopLevelExternDecl } from './parseExternBlock.js';
import { parseEnumDecl } from './parseEnum.js';
import { parseTopLevelFuncDecl } from './parseFunc.js';
import { parseGlobalsBlock } from './parseGlobals.js';
import { parseTopLevelOpDecl } from './parseOp.js';
import { parseTypeDecl, parseUnionDecl } from './parseTypes.js';
import {
  parseAlignDirectiveDecl,
  parseBinDecl,
  parseConstDecl,
  parseHexDecl,
  parseImportDecl,
} from './parseTopLevelSimple.js';
import { parseDataBlock } from './parseData.js';
import type { LogicalLine } from './parseLogicalLines.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import type { SourceFile } from './source.js';
import type {
  ModuleItemDispatchTable,
  ParseItemResult,
  ParseModuleItemDispatchArgs,
  RawModuleLine,
} from './parseModuleItemDispatch.js';

type CreateZaxModuleItemTableContext = {
  diagnostics: Diagnostic[];
  file: SourceFile;
  getRawLine: (lineIndex: number) => RawModuleLine;
  isReservedTopLevelName: (name: string) => boolean;
  lineCount: number;
  logicalLines: LogicalLine[];
  modulePath: string;
  parseOpParamsFromText: typeof import('./parseParams.js').parseOpParamsFromText;
  parseParamsFromText: typeof import('./parseParams.js').parseParamsFromText;
};

export function createZaxModuleItemTable(ctx: CreateZaxModuleItemTableContext) {
  const {
    diagnostics,
    file,
    getRawLine,
    isReservedTopLevelName,
    lineCount,
    logicalLines: _logicalLines,
    parseOpParamsFromText,
    parseParamsFromText,
  } = ctx;

  function parseImportItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
    ctx,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const importTail = consumeTopKeyword(rest, 'import') ?? '';
    if (ctx.scope === 'module') {
      const importNode = parseImportDecl(importTail, {
        diagnostics,
        modulePath: filePath,
        lineNo,
        text,
        span: stmtSpan,
        isReservedTopLevelName,
      });
      return { nextIndex: index + 1, ...(importNode ? { node: importNode } : {}) };
    }
    diag(diagnostics, filePath, `import is only permitted at module scope`, {
      line: lineNo,
      column: 1,
    });
    return { nextIndex: index + 1 };
  }

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

  function parseGlobalsItem({
    index,
    lineNo,
    filePath,
    rest,
  }: ParseModuleItemDispatchArgs): ParseItemResult | undefined {
    const storageHeader = rest.toLowerCase();
    if (storageHeader !== 'var' && storageHeader !== 'globals') return undefined;
    const parsedGlobals = parseGlobalsBlock(storageHeader, index, lineNo, {
      file,
      lineCount,
      diagnostics,
      modulePath: filePath,
      getRawLine,
      isReservedTopLevelName,
    });
    return { nextIndex: parsedGlobals.nextIndex };
  }

  function parseFuncItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
    hasExportPrefix,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const funcTail = consumeTopKeyword(rest, 'func') ?? '';
    const parsedFunc = parseTopLevelFuncDecl(
      funcTail,
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
        parseParamsFromText,
      },
    );
    return { nextIndex: parsedFunc.nextIndex, ...(parsedFunc.node ? { node: parsedFunc.node } : {}) };
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

  function parseExternItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const externTail = consumeTopKeyword(rest, 'extern') ?? '';
    const parsedExtern = parseTopLevelExternDecl(
      externTail,
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
        parseParamsFromText,
      },
    );
    return { nextIndex: parsedExtern.nextIndex, ...(parsedExtern.node ? { node: parsedExtern.node } : {}) };
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

  function parseDataItem({
    index,
    lineNo,
    filePath,
    rest,
    ctx,
  }: ParseModuleItemDispatchArgs): ParseItemResult | undefined {
    if (rest.toLowerCase() !== 'data') return undefined;
    if (ctx.scope === 'module') {
      const parsedData = parseDataBlock(index, {
        file,
        lineCount,
        diagnostics,
        modulePath: filePath,
        getRawLine,
      });
      return { nextIndex: parsedData.nextIndex };
    }
    diag(
      diagnostics,
      filePath,
      `Bare "data" marker lines are removed; use labels plus .db/.dw/.ds directives.`,
      {
        line: lineNo,
        column: 1,
      },
    );
    return { nextIndex: index + 1 };
  }

  return {
    import: parseImportItem,
    type: parseTypeItem,
    union: parseUnionItem,
    globals: parseGlobalsItem,
    var: parseGlobalsItem,
    func: parseFuncItem,
    op: parseOpItem,
    extern: parseExternItem,
    enum: parseEnumItem,
    align: parseAlignItem,
    const: parseConstItem,
    bin: parseBinItem,
    hex: parseHexItem,
    data: parseDataItem,
  } as ModuleItemDispatchTable;
}
