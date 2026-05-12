import type {
  AsmBlockNode,
  AsmItemNode,
  AsmLabelNode,
  FuncDeclNode,
  ParamNode,
  SourceSpan,
  VarBlockNode,
  VarDeclNode,
} from './ast.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import {
  appendParsedAsmStatement,
  isRecoverOnlyControlFrame,
  parseAsmStatement,
  type AsmControlFrame,
} from './parseAsmStatements.js';
import {
  diagInvalidBlockLine,
  looksLikeKeywordBodyDeclLine,
  parseReturnRegsFromText,
  parseVarDeclLine,
  topLevelStartKeyword,
} from './parseModuleCommon.js';
import type { ParseParamsContext } from './parseParams.js';
import { stripLineComment as stripComment } from './parseParserShared.js';
import { parseCallableHeader } from './parseCallableHeader.js';

type RawLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

type ParseFuncContext = {
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

type ParsedFuncDecl = {
  node?: FuncDeclNode;
  nextIndex: number;
};

export function parseTopLevelFuncDecl(
  funcTail: string,
  stmtText: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  startIndex: number,
  exported: boolean,
  ctx: ParseFuncContext,
): ParsedFuncDecl {
  const {
    file,
    lineCount,
    diagnostics,
    modulePath,
    getRawLine,
    isReservedTopLevelName,
    parseParamsFromText,
  } = ctx;
  const parsedHeader = parseCallableHeader({
    kind: 'func',
    header: funcTail,
    stmtText,
    stmtSpan,
    lineNo,
    diagnostics,
    modulePath,
    expectedHeader: '<name>(...): <retType>',
    isReservedTopLevelName,
    parseParams: (paramsText) =>
      parseParamsFromText(modulePath, paramsText, stmtSpan, diagnostics, {
        isReservedTopLevelName,
      }),
  });
  if (!parsedHeader) {
    return { nextIndex: startIndex + 1 };
  }

  const name = parsedHeader.name;
  const params = parsedHeader.params;
  const funcStartOffset = stmtSpan.start.offset;
  const afterClose = parsedHeader.trailing;
  let returnRegs: string[] = [];
  if (afterClose.length !== 0) {
    const retMatch = /^:\s*(.+)$/.exec(afterClose);
    if (!retMatch) {
      diag(diagnostics, modulePath, `Invalid func header: expected ": <return registers>"`, {
        line: lineNo,
        column: 1,
      });
      return { nextIndex: startIndex + 1 };
    }
    const parsedRegs = parseReturnRegsFromText(
      retMatch[1]!.trim(),
      stmtSpan,
      lineNo,
      diagnostics,
      modulePath,
    );
    if (!parsedRegs) return { nextIndex: startIndex + 1 };
    returnRegs = parsedRegs.regs;
  }

  let index = startIndex + 1;

  let locals: VarBlockNode | undefined;
  let asmStartOffset: number | undefined;
  let interruptedBeforeBodyKeyword: string | undefined;
  let interruptedBeforeBodyLine: number | undefined;
  let interruptedBeforeBodyFilePath: string | undefined;
  while (index < lineCount) {
    const { raw: raw2, startOffset: so2, lineNo: lineNo2, filePath: filePath2 } = getRawLine(index);
    const t2 = stripComment(raw2).trim();
    const t2Lower = t2.toLowerCase();
    if (t2.length === 0) {
      index++;
      continue;
    }
    const t2TopKeyword = topLevelStartKeyword(t2);
    if (t2TopKeyword !== undefined && t2Lower !== 'var') {
      interruptedBeforeBodyKeyword = t2TopKeyword;
      interruptedBeforeBodyLine = lineNo2;
      interruptedBeforeBodyFilePath = filePath2;
      break;
    }

    if (t2Lower === 'var') {
      const varStart = so2;
      index++;
      const decls: VarDeclNode[] = [];
      const declNamesLower = new Set<string>();
      let varTerminated = false;

      while (index < lineCount) {
        const {
          raw: rawDecl,
          startOffset: soDecl,
          endOffset: eoDecl,
          lineNo: declLineNo,
          filePath: declFilePath,
        } = getRawLine(index);
        const tDecl = stripComment(rawDecl).trim();
        const tDeclLower = tDecl.toLowerCase();
        if (tDecl.length === 0) {
          index++;
          continue;
        }
        if (tDeclLower === 'end') {
          locals = {
            kind: 'VarBlock',
            span: span(file, varStart, eoDecl),
            scope: 'function',
            decls,
          };
          index++;
          varTerminated = true;
          break;
        }
        if (tDeclLower === 'asm') {
          diag(
            diagnostics,
            declFilePath,
            `Function-local var block must end with "end" before function body`,
            { line: declLineNo, column: 1 },
          );
          locals = {
            kind: 'VarBlock',
            span: span(file, varStart, soDecl),
            scope: 'function',
            decls,
          };
          index++;
          varTerminated = true;
          break;
        }
        const tDeclTopKeyword = topLevelStartKeyword(tDecl);
        if (tDeclTopKeyword !== undefined) {
          if (looksLikeKeywordBodyDeclLine(tDecl)) {
            diagInvalidBlockLine(
              diagnostics,
              declFilePath,
              'var declaration',
              tDecl,
              '<name>: <type>',
              declLineNo,
            );
            index++;
            continue;
          }
          interruptedBeforeBodyKeyword = tDeclTopKeyword;
          interruptedBeforeBodyLine = declLineNo;
          interruptedBeforeBodyFilePath = declFilePath;
          locals = {
            kind: 'VarBlock',
            span: span(file, varStart, soDecl),
            scope: 'function',
            decls,
          };
          break;
        }

        const declSpan = span(file, soDecl, eoDecl);
        const parsed = parseVarDeclLine(tDecl, declSpan, declLineNo, 'var', {
          diagnostics,
          modulePath: declFilePath,
          isReservedTopLevelName,
        });
        if (!parsed) {
          index++;
          continue;
        }
        const localNameLower = parsed.name.toLowerCase();
        if (declNamesLower.has(localNameLower)) {
          diag(diagnostics, declFilePath, `Duplicate var declaration name "${parsed.name}".`, {
            line: declLineNo,
            column: 1,
          });
          index++;
          continue;
        }
        declNamesLower.add(localNameLower);
        decls.push(parsed);
        index++;
      }
      if (interruptedBeforeBodyKeyword !== undefined) break;
      if (!varTerminated) {
        diag(
          diagnostics,
          modulePath,
          `Unterminated func "${name}": expected "end" to terminate var block`,
          {
            line: lineNo,
            column: 1,
          },
        );
        return { nextIndex: index };
      }
      continue;
    }

    if (t2Lower === 'end') {
      asmStartOffset = so2;
      break;
    }
    asmStartOffset = so2;
    break;
  }

  if (asmStartOffset === undefined) {
    if (interruptedBeforeBodyKeyword !== undefined && interruptedBeforeBodyLine !== undefined) {
      diag(
        diagnostics,
        interruptedBeforeBodyFilePath ?? modulePath,
        `Unterminated func "${name}": expected function body before "${interruptedBeforeBodyKeyword}"`,
        { line: interruptedBeforeBodyLine, column: 1 },
      );
      return { nextIndex: index };
    }
    diag(diagnostics, modulePath, `Unterminated func "${name}": expected function body`, {
      line: lineNo,
      column: 1,
    });
    return { nextIndex: lineCount };
  }

  const asmItems: AsmItemNode[] = [];
  const asmControlStack: AsmControlFrame[] = [];
  let interruptedByKeyword: string | undefined;
  let interruptedByLine: number | undefined;
  let interruptedByFilePath: string | undefined;
  while (index < lineCount) {
    const {
      raw: rawLine,
      startOffset: lineOffset,
      endOffset,
      lineNo: bodyLineNo,
      filePath: bodyFilePath,
    } = getRawLine(index);
    const withoutComment = stripComment(rawLine);
    const content = withoutComment.trim();
    const contentLower = content.toLowerCase();
    if (content.length === 0) {
      index++;
      continue;
    }
    if (contentLower === 'asm' && asmControlStack.length === 0 && asmItems.length === 0) {
      diag(
        diagnostics,
        bodyFilePath,
        `Unexpected "asm" in function body (function bodies are implicit)`,
        { line: bodyLineNo, column: 1 },
      );
      index++;
      continue;
    }

    if (contentLower === 'end' && asmControlStack.length === 0) {
      const funcEndOffset = endOffset;
      const funcSpan = span(file, funcStartOffset, funcEndOffset);
      const asmSpan = span(file, asmStartOffset, funcEndOffset);
      const asm: AsmBlockNode = { kind: 'AsmBlock', span: asmSpan, items: asmItems };
      const localsNode: VarBlockNode =
        locals ??
        ({
          kind: 'VarBlock',
          span: span(file, funcStartOffset, funcStartOffset),
          scope: 'function',
          decls: [],
        } satisfies VarBlockNode);

      return {
        node: {
          kind: 'FuncDecl',
          span: funcSpan,
          name,
          exported,
          params,
          returnRegs,
          locals: localsNode,
          asm,
        },
        nextIndex: index + 1,
      };
    }
    const topKeyword = topLevelStartKeyword(content);
    if (topKeyword !== undefined) {
      interruptedByKeyword = topKeyword;
      interruptedByLine = bodyLineNo;
      interruptedByFilePath = bodyFilePath;
      break;
    }

    const fullSpan = span(file, lineOffset, endOffset);
    const contentStart = withoutComment.indexOf(content);
    const contentSpan =
      contentStart >= 0
        ? span(file, lineOffset + contentStart, lineOffset + withoutComment.length)
        : fullSpan;

    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:(?!\=)\s*(.*)$/.exec(content);
    if (labelMatch) {
      const label = labelMatch[1]!;
      const remainder = labelMatch[2] ?? '';
      const labelNode: AsmLabelNode = { kind: 'AsmLabel', span: fullSpan, name: label };
      asmItems.push(labelNode);
      if (remainder.trim().length > 0) {
        const stmtNode = parseAsmStatement(
          bodyFilePath,
          remainder,
          contentSpan,
          diagnostics,
          asmControlStack,
        );
        appendParsedAsmStatement(asmItems, stmtNode);
      }
      index++;
      continue;
    }

    const stmtNode = parseAsmStatement(
      bodyFilePath,
      content,
      contentSpan,
      diagnostics,
      asmControlStack,
    );
    appendParsedAsmStatement(asmItems, stmtNode);
    index++;
  }

  if (interruptedByKeyword !== undefined && interruptedByLine !== undefined) {
    for (const frame of asmControlStack) {
      if (isRecoverOnlyControlFrame(frame)) continue;
      const frameSpan = frame.openSpan;
      const msg =
        frame.kind === 'Repeat'
          ? `"repeat" without matching "until <cc>"`
          : `"${frame.kind.toLowerCase()}" without matching "end"`;
      diag(diagnostics, frameSpan.file, msg, {
        line: frameSpan.start.line,
        column: frameSpan.start.column,
      });
    }
    diag(
      diagnostics,
      interruptedByFilePath ?? modulePath,
      `Unterminated func "${name}": expected "end" before "${interruptedByKeyword}"`,
      { line: interruptedByLine, column: 1 },
    );
    return { nextIndex: index };
  }
  for (const frame of asmControlStack) {
    if (isRecoverOnlyControlFrame(frame)) continue;
    const frameSpan = frame.openSpan;
    const msg =
      frame.kind === 'Repeat'
        ? `"repeat" without matching "until <cc>"`
        : `"${frame.kind.toLowerCase()}" without matching "end"`;
    diag(diagnostics, frameSpan.file, msg, {
      line: frameSpan.start.line,
      column: frameSpan.start.column,
    });
  }
  diag(diagnostics, modulePath, `Unterminated func "${name}": missing "end"`, {
    line: lineNo,
    column: 1,
  });
  return { nextIndex: lineCount };
}
