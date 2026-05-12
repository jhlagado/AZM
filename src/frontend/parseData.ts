import type { DataBlockNode, DataDeclNode, DataRecordFieldInitNode, ImmExprNode } from './ast.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { parseImmExprFromText, parseTypeExprFromText } from './parseImm.js';
import {
  TOP_LEVEL_KEYWORDS,
  diagInvalidBlockLine,
  formatIdentifierToken,
  isTopLevelStart,
  looksLikeKeywordBodyDeclLine,
} from './parseModuleCommon.js';
import { stripLineComment as stripComment } from './parseParserShared.js';

function splitTopLevelComma(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inChar = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inChar) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === "'") inChar = false;
      continue;
    }
    if (ch === "'") {
      inChar = true;
      continue;
    }
    if (ch === '(') {
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      continue;
    }
    if (ch === ']') {
      if (bracketDepth > 0) bracketDepth--;
      continue;
    }
    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      if (braceDepth > 0) braceDepth--;
      continue;
    }
    if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

type RawLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

type ParseDataContext = {
  file: SourceFile;
  lineCount: number;
  diagnostics: Diagnostic[];
  modulePath: string;
  getRawLine: (lineIndex: number) => RawLine;
  stopOnEnd?: boolean;
};

type ParsedDataBlock = {
  node: DataBlockNode;
  nextIndex: number;
};

type ParseDataDeclOptions = {
  allowOmittedInitializer: boolean;
  allowInferredArrayLength: boolean;
  modulePath: string;
  diagnostics: Diagnostic[];
  lineNo: number;
  text: string;
  span: ReturnType<typeof span>;
  seenNames?: Set<string>;
};

export function parseDataDeclLine(opts: ParseDataDeclOptions): DataDeclNode | undefined {
  const {
    allowOmittedInitializer,
    allowInferredArrayLength,
    modulePath,
    diagnostics,
    lineNo,
    text,
    span: lineSpan,
    seenNames,
  } = opts;

  const withInit = /^([^:]+)\s*:\s*([^=]+?)\s*=\s*(.+)$/.exec(text);
  const withoutInit = allowOmittedInitializer ? /^([^:]+)\s*:\s*(.+)$/.exec(text) : undefined;
  const match = withInit ?? withoutInit;
  if (!match) {
    diagInvalidBlockLine(
      diagnostics,
      modulePath,
      'data declaration',
      text,
      allowOmittedInitializer ? '<name>: <type> [= <initializer>]' : '<name>: <type> = <initializer>',
      lineNo,
    );
    return undefined;
  }

  const name = match[1]!.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid data declaration name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (TOP_LEVEL_KEYWORDS.has(name.toLowerCase())) {
    diag(
      diagnostics,
      modulePath,
      `Invalid data declaration name "${name}": collides with a top-level keyword.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  const nameLower = name.toLowerCase();
  if (seenNames?.has(nameLower)) {
    diag(diagnostics, modulePath, `Duplicate data declaration name "${name}".`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }

  const typeText = (withInit ? withInit[2] : withoutInit?.[2])!.trim();
  const initText = withInit?.[3]?.trim();
  const typeExpr = parseTypeExprFromText(typeText, lineSpan, {
    allowInferredArrayLength,
  });

  if (!typeExpr) {
    diagInvalidBlockLine(
      diagnostics,
      modulePath,
      'data declaration',
      text,
      allowOmittedInitializer ? '<name>: <type> [= <initializer>]' : '<name>: <type> = <initializer>',
      lineNo,
    );
    return undefined;
  }

  let initializer: DataDeclNode['initializer'] | undefined;
  if (!initText) {
    initializer = { kind: 'InitZero', span: lineSpan };
  } else if (initText.startsWith('"') && initText.endsWith('"') && initText.length >= 2) {
    initializer = { kind: 'InitString', span: lineSpan, value: initText.slice(1, -1) };
  } else if (initText.startsWith('{') && initText.endsWith('}')) {
    const inner = initText.slice(1, -1).trim();
    const parts = inner.length === 0 ? [] : splitTopLevelComma(inner).map((p) => p.trim());
    const namedFields: DataRecordFieldInitNode[] = [];
    const positionalElements: ImmExprNode[] = [];
    let sawNamed = false;
    let sawPositional = false;
    let parseFailed = false;

    for (const part of parts) {
      if (part.length === 0) {
        parseFailed = true;
        break;
      }
      const namedMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(part);
      if (namedMatch) {
        sawNamed = true;
        const value = parseImmExprFromText(modulePath, namedMatch[2]!.trim(), lineSpan, diagnostics);
        if (!value) {
          parseFailed = true;
          continue;
        }
        namedFields.push({
          kind: 'DataRecordFieldInit',
          span: lineSpan,
          name: namedMatch[1]!,
          value,
        });
        continue;
      }
      sawPositional = true;
      const e = parseImmExprFromText(modulePath, part, lineSpan, diagnostics);
      if (!e) {
        parseFailed = true;
        continue;
      }
      positionalElements.push(e);
    }

    if (sawNamed && sawPositional) {
      diag(
        diagnostics,
        modulePath,
        `Mixed positional and named aggregate initializer entries are not allowed for "${name}".`,
        { line: lineNo, column: 1 },
      );
      parseFailed = true;
    }

    if (!parseFailed) {
      initializer = sawNamed
        ? { kind: 'InitRecordNamed', span: lineSpan, fields: namedFields }
        : { kind: 'InitArray', span: lineSpan, elements: positionalElements };
    }
  } else if (initText.startsWith('[') && initText.endsWith(']')) {
    const inner = initText.slice(1, -1).trim();
    const parts = inner.length === 0 ? [] : splitTopLevelComma(inner).map((p) => p.trim());
    const elements: ImmExprNode[] = [];
    for (const part of parts) {
      const e = parseImmExprFromText(modulePath, part, lineSpan, diagnostics);
      if (e) elements.push(e);
    }
    initializer = { kind: 'InitArray', span: lineSpan, elements };
  } else {
    const e = parseImmExprFromText(modulePath, initText, lineSpan, diagnostics);
    if (e) initializer = { kind: 'InitArray', span: lineSpan, elements: [e] };
  }

  if (!initializer) return undefined;
  seenNames?.add(nameLower);
  return {
    kind: 'DataDecl',
    span: lineSpan,
    name,
    typeExpr,
    initializer,
  };
}

export function parseDataBlock(startIndex: number, ctx: ParseDataContext): ParsedDataBlock {
  const { file, lineCount, diagnostics, modulePath, getRawLine, stopOnEnd = false } = ctx;
  const { lineNo: headerLineNo, filePath: headerFilePath } = getRawLine(startIndex);
  if (!stopOnEnd) {
    diag(
      diagnostics,
      headerFilePath ?? modulePath,
      'Legacy top-level "data ... end" blocks are removed; use direct declarations inside named data sections.',
      { line: headerLineNo, column: 1 },
    );
  }
  const blockStart = getRawLine(startIndex).startOffset;
  let index = startIndex + 1;
  const decls: DataDeclNode[] = [];
  const declNamesLower = new Set<string>();

  while (index < lineCount) {
    const {
      raw: rawDecl,
      startOffset: so,
      endOffset: eo,
      lineNo: declLineNo,
      filePath: declFilePath,
    } = getRawLine(index);
    const t = stripComment(rawDecl).trim();
    if (t.length === 0) {
      index++;
      continue;
    }
    if (stopOnEnd && t.toLowerCase() === 'end') break;
    if (isTopLevelStart(t)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=]+?)\s*=\s*(.+)$/.exec(t);
      if (m && TOP_LEVEL_KEYWORDS.has(m[1]!.toLowerCase())) {
        diag(
          diagnostics,
          declFilePath,
          `Invalid data declaration name "${m[1]!}": collides with a top-level keyword.`,
          { line: declLineNo, column: 1 },
        );
        index++;
        continue;
      }
      if (looksLikeKeywordBodyDeclLine(t)) {
        diagInvalidBlockLine(
          diagnostics,
          declFilePath,
          'data declaration',
          t,
          '<name>: <type> = <initializer>',
          declLineNo,
        );
        index++;
        continue;
      }
      break;
    }

    const lineSpan = span(file, so, eo);
    const decl = parseDataDeclLine({
      allowOmittedInitializer: false,
      allowInferredArrayLength: true,
      modulePath: declFilePath,
      diagnostics,
      lineNo: declLineNo,
      text: t,
      span: lineSpan,
      seenNames: declNamesLower,
    });
    if (decl) decls.push(decl);
    index++;
  }

  const blockEnd =
    index < lineCount ? (getRawLine(index).startOffset ?? blockStart) : file.text.length;
  return {
    node: {
      kind: 'DataBlock',
      span: span(file, blockStart, blockEnd),
      decls,
    },
    nextIndex: index,
  };
}
