import type { ExternDeclNode, ExternFuncNode, ParamNode, SourceSpan } from './ast.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { consumeKeywordPrefix } from './parseModuleCommon.js';
import {
  diagInvalidBlockLine,
  diagInvalidHeaderLine,
  formatIdentifierToken,
  looksLikeKeywordBodyDeclLine,
  topLevelStartKeyword,
} from './parseModuleCommon.js';
import { parseExternFuncFromTail } from './parseExtern.js';
import type { ParseParamsContext } from './parseParams.js';
import { stripLineComment as stripComment } from './parseParserShared.js';

type RawLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

type ParseExternBlockContext = {
  file: SourceFile;
  lineCount: number;
  diagnostics: Diagnostic[];
  modulePath: string;
  getRawLine: (lineIndex: number) => RawLine;
  parseParamsFromText: (
    filePath: string,
    paramsText: string,
    paramsSpan: SourceSpan,
    diagnostics: Diagnostic[],
    ctx: ParseParamsContext,
  ) => ParamNode[] | undefined;
} & ParseParamsContext;

type ParsedExternDecl = {
  node?: ExternDeclNode;
  nextIndex: number;
};

function consumeInvalidExternBlock(startIndex: number, ctx: ParseExternBlockContext): number {
  const { lineCount, getRawLine } = ctx;
  let previewIndex = startIndex + 1;
  while (previewIndex < lineCount) {
    const { raw } = getRawLine(previewIndex);
    const t = stripComment(raw).trim();
    if (t.length === 0) {
      previewIndex++;
      continue;
    }
    const looksLikeBodyStart =
      t.toLowerCase() === 'end' ||
      consumeKeywordPrefix(t, 'func') !== undefined ||
      looksLikeKeywordBodyDeclLine(t);
    if (!looksLikeBodyStart) return startIndex + 1;
    break;
  }
  if (previewIndex >= lineCount) return startIndex + 1;

  let index = previewIndex;
  while (index < lineCount) {
    const { raw } = getRawLine(index);
    const t = stripComment(raw).trim();
    const tLower = t.toLowerCase();
    if (t.length === 0) {
      index++;
      continue;
    }
    if (tLower === 'end') return index + 1;
    const topKeyword = topLevelStartKeyword(t);
    if (
      topKeyword !== undefined &&
      consumeKeywordPrefix(t, 'func') === undefined &&
      !looksLikeKeywordBodyDeclLine(t)
    ) {
      return index;
    }
    index++;
  }
  return lineCount;
}

export function parseTopLevelExternDecl(
  externTail: string,
  stmtText: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  startIndex: number,
  ctx: ParseExternBlockContext,
): ParsedExternDecl {
  const {
    file,
    lineCount,
    diagnostics,
    modulePath,
    getRawLine,
    isReservedTopLevelName,
    parseParamsFromText,
  } = ctx;
  const decl = externTail.trim();
  const externFuncTail = consumeKeywordPrefix(decl, 'func');
  if (externFuncTail !== undefined) {
    const externFunc = parseExternFuncFromTail(externFuncTail, stmtSpan, lineNo, {
      diagnostics,
      modulePath,
      isReservedTopLevelName,
      parseParamsFromText,
    });
    return {
      ...(externFunc
        ? {
            node: {
              kind: 'ExternDecl',
              span: stmtSpan,
              funcs: [externFunc],
            } as ExternDeclNode,
          }
        : {}),
      nextIndex: startIndex + 1,
    };
  }

  if (decl.length > 0) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(decl)) {
      diag(
        diagnostics,
        modulePath,
        `Invalid extern base name ${formatIdentifierToken(decl)}: expected <identifier>.`,
        { line: lineNo, column: 1 },
      );
      return { nextIndex: consumeInvalidExternBlock(startIndex, ctx) };
    }
    if (isReservedTopLevelName(decl)) {
      diag(
        diagnostics,
        modulePath,
        `Invalid extern base name "${decl}": collides with a top-level keyword.`,
        { line: lineNo, column: 1 },
      );
      return { nextIndex: consumeInvalidExternBlock(startIndex, ctx) };
    }
  }

  let preview = startIndex + 1;
  let previewText: string | undefined;
  while (preview < lineCount) {
    const { raw: rawPreview } = getRawLine(preview);
    const t = stripComment(rawPreview).trim();
    if (t.length === 0) {
      preview++;
      continue;
    }
    previewText = t;
    break;
  }
  const previewKeyword = previewText ? topLevelStartKeyword(previewText) : undefined;
  const previewLooksLikeExternBodyDecl =
    previewText !== undefined &&
    previewKeyword !== undefined &&
    looksLikeKeywordBodyDeclLine(previewText);
  if (
    previewText === undefined ||
    (previewText.toLowerCase() !== 'end' &&
      consumeKeywordPrefix(previewText, 'func') === undefined &&
      !previewLooksLikeExternBodyDecl)
  ) {
    diagInvalidHeaderLine(
      diagnostics,
      modulePath,
      'extern declaration',
      stmtText,
      '[<baseName>] or func <name>(...): <retType> at <imm16>',
      lineNo,
    );
    return { nextIndex: startIndex + 1 };
  }

  const blockStart = stmtSpan.start.offset;
  const funcs: ExternFuncNode[] = [];
  const base = decl.length > 0 ? decl : undefined;
  let terminated = false;
  let interruptedByKeyword: string | undefined;
  let interruptedByLine: number | undefined;
  let interruptedByFilePath: string | undefined;
  let blockEndOffset = file.text.length;
  let index = startIndex + 1;

  while (index < lineCount) {
    const {
      raw: rawDecl,
      startOffset: so,
      endOffset: eo,
      lineNo: declLineNo,
      filePath: declFilePath,
    } = getRawLine(index);
    const t = stripComment(rawDecl).trim();
    const tLower = t.toLowerCase();
    if (t.length === 0) {
      index++;
      continue;
    }
    if (tLower === 'end') {
      terminated = true;
      blockEndOffset = eo;
      index++;
      break;
    }
    const topKeyword = topLevelStartKeyword(t);
    if (topKeyword !== undefined && consumeKeywordPrefix(t, 'func') === undefined) {
      if (looksLikeKeywordBodyDeclLine(t)) {
        diagInvalidBlockLine(
          diagnostics,
          declFilePath,
          'extern func declaration',
          t,
          'func <name>(...): <retType> at <imm16>',
          declLineNo,
        );
        index++;
        continue;
      }
      interruptedByKeyword = topKeyword;
      interruptedByLine = declLineNo;
      interruptedByFilePath = declFilePath;
      break;
    }

    const funcTail = consumeKeywordPrefix(t, 'func');
    if (funcTail === undefined) {
      diagInvalidBlockLine(
        diagnostics,
        declFilePath,
        'extern func declaration',
        t,
        'func <name>(...): <retType> at <imm16>',
        declLineNo,
      );
      index++;
      continue;
    }

    const fn = parseExternFuncFromTail(funcTail, span(file, so, eo), declLineNo, {
      diagnostics,
      modulePath: declFilePath,
      isReservedTopLevelName,
      parseParamsFromText,
    });
    if (fn) funcs.push(fn);
    index++;
  }

  if (!terminated) {
    const namePart = base ? ` "${base}"` : '';
    if (interruptedByKeyword !== undefined && interruptedByLine !== undefined) {
      diag(
        diagnostics,
        interruptedByFilePath ?? modulePath,
        `Unterminated extern${namePart}: expected "end" before "${interruptedByKeyword}"`,
        { line: interruptedByLine, column: 1 },
      );
    } else {
      diag(diagnostics, modulePath, `Unterminated extern${namePart}: missing "end"`, {
        line: lineNo,
        column: 1,
      });
    }
  }
  if (funcs.length === 0) {
    diag(diagnostics, modulePath, `extern block must contain at least one func declaration`, {
      line: lineNo,
      column: 1,
    });
  }

  return {
    node: {
      kind: 'ExternDecl',
      span: span(file, blockStart, terminated ? blockEndOffset : file.text.length),
      ...(base ? { base } : {}),
      funcs,
    },
    nextIndex: index,
  };
}
