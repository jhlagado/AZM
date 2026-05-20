import type {
  NamedSectionNode,
  SectionAnchorNode,
  SectionItemNode,
} from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { NAMED_SECTION_KINDS } from './grammarData.js';
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
  parseSectionDirectiveDecl,
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

type NamedSectionHeader = {
  section: 'code' | 'data';
  name: string;
  anchor?: SectionAnchorNode;
};

type CreateZaxModuleItemTableContext = {
  diagnostics: Diagnostic[];
  file: SourceFile;
  getRawLine: (lineIndex: number) => RawModuleLine;
  isReservedTopLevelName: (name: string) => boolean;
  lineCount: number;
  logicalLines: LogicalLine[];
  modulePath: string;
  parseSectionHeader: (
    sectionText: string,
    sectionSpan: NamedSectionNode['span'],
    lineNo: number,
    originalText: string,
    filePath: string,
  ) => NamedSectionHeader | undefined;
  parseOpParamsFromText: typeof import('./parseParams.js').parseOpParamsFromText;
  parseParamsFromText: typeof import('./parseParams.js').parseParamsFromText;
  parseSectionItems: (startIndex: number, sectionKind: 'code' | 'data') => {
    items: SectionItemNode[];
    nextIndex: number;
    closed: boolean;
  };
  span: typeof import('./source.js').span;
};

export function createZaxModuleItemTable(ctx: CreateZaxModuleItemTableContext) {
  const {
    diagnostics,
    file,
    getRawLine,
    isReservedTopLevelName,
    lineCount,
    logicalLines: _logicalLines,
    parseSectionHeader,
    parseOpParamsFromText,
    parseParamsFromText,
    parseSectionItems,
    span,
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

  function parseSectionItem({
    index,
    lineNo,
    filePath,
    text,
    rest,
    stmtSpan,
    lineStartOffset,
    ctx,
  }: ParseModuleItemDispatchArgs): ParseItemResult {
    const sectionTail = consumeTopKeyword(rest, 'section') ?? '';
    if (ctx.scope === 'section') {
      diag(diagnostics, filePath, `nested section blocks are not supported`, {
        line: lineNo,
        column: 1,
      });
      return { nextIndex: index + 1 };
    }

    const sectionDecl = rest === 'section' ? '' : sectionTail;
    const namedTokens = sectionDecl.trim().split(/\s+/).filter((token) => token.length > 0);
    const namedPrefix =
      namedTokens.length >= 2 &&
      NAMED_SECTION_KINDS.has((namedTokens[0] ?? '').toLowerCase()) &&
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(namedTokens[1] ?? '') &&
      !/^(at|size|end)$/i.test(namedTokens[1] ?? '');
    if (namedPrefix) {
      const header = parseSectionHeader(sectionDecl, stmtSpan, lineNo, text, filePath);
      if (!header) return { nextIndex: index + 1 };
      const parsedSection = parseSectionItems(index + 1, header.section);
      const sectionEndIndex = Math.max(parsedSection.nextIndex - 1, index);
      const sectionEnd = getRawLine(sectionEndIndex);
      const sectionNode: NamedSectionNode = {
        kind: 'NamedSection',
        span: span(file, lineStartOffset, sectionEnd.endOffset),
        section: header.section,
        name: header.name,
        items: parsedSection.items,
        ...(header.anchor ? { anchor: header.anchor } : {}),
      };
      if (!parsedSection.closed) {
        diag(diagnostics, filePath, `Missing end for section "${header.name}"`, {
          line: lineNo,
          column: 1,
        });
      }
      return { nextIndex: parsedSection.nextIndex, node: sectionNode };
    }

    parseSectionDirectiveDecl(rest, sectionTail, {
      diagnostics,
      modulePath: filePath,
      lineNo,
      text,
      span: stmtSpan,
      isReservedTopLevelName,
    });
    return { nextIndex: index + 1 };
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
      `Bare "data" marker lines are removed; declare symbols directly inside named data sections.`,
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
    section: parseSectionItem,
    align: parseAlignItem,
    const: parseConstItem,
    bin: parseBinItem,
    hex: parseHexItem,
    data: parseDataItem,
  } as ModuleItemDispatchTable;
}
