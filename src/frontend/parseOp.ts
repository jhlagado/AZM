import type { AsmBlockNode, AsmItemNode, OpDeclNode, OpParamNode, SourceSpan } from './ast.js';
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

type ParseOpContext = {
  file: SourceFile;
  lineCount: number;
  diagnostics: Diagnostic[];
  modulePath: string;
  getRawLine: (lineIndex: number) => RawLine;
  parseOpParamsFromText: (
    filePath: string,
    paramsText: string,
    paramsSpan: SourceSpan,
    diagnostics: Diagnostic[],
    ctx: ParseParamsContext,
  ) => OpParamNode[] | undefined;
} & ParseParamsContext;

type ParsedOpDecl = {
  node: OpDeclNode;
  nextIndex: number;
};

export function parseTopLevelOpDecl(
  opTail: string,
  stmtText: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  startIndex: number,
  exported: boolean,
  ctx: ParseOpContext,
): ParsedOpDecl | undefined {
  const {
    file,
    lineCount,
    diagnostics,
    modulePath,
    getRawLine,
    isReservedTopLevelName,
    parseOpParamsFromText,
  } = ctx;
  const parsedHeader = parseCallableHeader({
    kind: 'op',
    header: opTail,
    stmtText,
    stmtSpan,
    lineNo,
    diagnostics,
    modulePath,
    expectedHeader: '<name>(...)',
    isReservedTopLevelName,
    parseParams: (paramsText) =>
      parseOpParamsFromText(modulePath, paramsText, stmtSpan, diagnostics, {
        isReservedTopLevelName,
      }),
  });
  if (!parsedHeader) {
    return undefined;
  }

  const name = parsedHeader.name;
  const params = parsedHeader.params;
  const allowedConditionIdentifiers = new Set(params.map((param) => param.name.toLowerCase()));
  const trailing = parsedHeader.trailing.trim();
  if (trailing.length > 0) {
    diag(diagnostics, modulePath, `Invalid op header: unexpected trailing tokens`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }

  const opStartOffset = stmtSpan.start.offset;

  let index = startIndex + 1;
  const bodyItems: AsmItemNode[] = [];
  const controlStack: AsmControlFrame[] = [];
  let terminated = false;
  let interruptedByKeyword: string | undefined;
  let interruptedByLine: number | undefined;
  let interruptedByFilePath: string | undefined;
  let opEndOffset = file.text.length;
  while (index < lineCount) {
    const {
      raw: rawLine,
      startOffset: so,
      endOffset: eo,
      lineNo: bodyLineNo,
      filePath: bodyFilePath,
    } = getRawLine(index);
    const rawNoComment = stripComment(rawLine);
    const content = rawNoComment.trim();
    const contentLower = content.toLowerCase();
    if (content.length === 0) {
      index++;
      continue;
    }
    if (bodyItems.length === 0 && controlStack.length === 0 && contentLower === 'asm') {
      diag(diagnostics, bodyFilePath, `Unexpected "asm" in op body (op bodies are implicit)`, {
        line: bodyLineNo,
        column: 1,
      });
      index++;
      continue;
    }
    if (contentLower === 'end' && controlStack.length === 0) {
      terminated = true;
      opEndOffset = eo;
      index++;
      break;
    }
    const topKeyword = topLevelStartKeyword(content);
    if (topKeyword !== undefined) {
      interruptedByKeyword = topKeyword;
      interruptedByLine = bodyLineNo;
      interruptedByFilePath = bodyFilePath;
      break;
    }

    const fullSpan = span(file, so, eo);
    const contentStart = rawNoComment.indexOf(content);
    const contentSpan =
      contentStart >= 0 ? span(file, so + contentStart, so + rawNoComment.length) : fullSpan;
    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:(?!\=)\s*(.*)$/.exec(content);
    if (labelMatch) {
      const label = labelMatch[1]!;
      const remainder = labelMatch[2] ?? '';
      bodyItems.push({ kind: 'AsmLabel', span: fullSpan, name: label });
      if (remainder.trim().length > 0) {
        const stmt = parseAsmStatement(
          bodyFilePath,
          remainder,
          contentSpan,
          diagnostics,
          controlStack,
          { allowedConditionIdentifiers },
        );
        appendParsedAsmStatement(bodyItems, stmt);
      }
      index++;
      continue;
    }

    const stmt = parseAsmStatement(bodyFilePath, content, contentSpan, diagnostics, controlStack, {
      allowedConditionIdentifiers,
    });
    appendParsedAsmStatement(bodyItems, stmt);
    index++;
  }

  if (!terminated) {
    if (interruptedByKeyword !== undefined && interruptedByLine !== undefined) {
      for (const frame of controlStack) {
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
        `Unterminated op "${name}": expected "end" before "${interruptedByKeyword}"`,
        {
          line: interruptedByLine,
          column: 1,
        },
      );
    } else {
      for (const frame of controlStack) {
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
      diag(diagnostics, modulePath, `Unterminated op "${name}": missing "end"`, {
        line: lineNo,
        column: 1,
      });
    }
  }

  return {
    node: {
      kind: 'OpDecl',
      span: span(file, opStartOffset, opEndOffset),
      name,
      exported,
      params,
      body: {
        kind: 'AsmBlock',
        span: span(file, opStartOffset, opEndOffset),
        items: bodyItems,
      } as AsmBlockNode,
    },
    nextIndex: index,
  };
}
