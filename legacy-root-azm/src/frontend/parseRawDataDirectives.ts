import type { Diagnostic } from '../diagnosticTypes.js';

import type { AsmRawDataNode, ImmExprNode, SourceSpan } from './ast.js';
import { parseImmExprFromText, parseTypeExprFromText } from './parseImm.js';
import { parseDiag as diag } from './parseDiagnostics.js';

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

function parseRawDataValues(
  directive: 'db' | 'dw',
  valuesText: string,
  lineNo: number,
  lineSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
): AsmRawDataNode | undefined {
  const parts = splitTopLevelComma(valuesText).map((part) => part.trim());
  if (parts.length === 0 || parts.every((part) => part.length === 0)) {
    diag(diagnostics, filePath, `"${directive}" expects one or more imm expressions`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }
  const values: ImmExprNode[] = [];
  for (const part of parts) {
    if (part.length === 0) {
      diag(diagnostics, filePath, `"${directive}" expects one or more imm expressions`, {
        line: lineNo,
        column: 1,
      });
      return undefined;
    }
    const expr = parseImmExprFromText(filePath, part, lineSpan, diagnostics);
    if (!expr) return undefined;
    values.push(expr);
  }
  return { kind: 'AsmRawData', span: lineSpan, name: '', directive, values, valuesText };
}

function parseRawDataSizeExpr(
  sizeText: string,
  lineSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
): ImmExprNode | undefined {
  const imm = parseImmExprFromText(filePath, sizeText, lineSpan, diagnostics, false);
  if (imm) return imm;

  if (/\[[^\]]+\]/.test(sizeText) || /^(?:byte|word|addr)$/i.test(sizeText.trim())) {
    const typeExpr = parseTypeExprFromText(sizeText, lineSpan);
    if (typeExpr) return { kind: 'ImmSizeof', span: lineSpan, typeExpr };
  }

  return parseImmExprFromText(filePath, sizeText, lineSpan, diagnostics);
}

export function parseRawDataSizeOperands(
  sizeText: string,
  lineNo: number,
  lineSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
): AsmRawDataNode | undefined {
  const parts = splitTopLevelComma(sizeText).map((part) => part.trim());
  if (parts.length < 1 || parts.length > 2 || parts[0]!.length === 0) {
    diag(diagnostics, filePath, '"ds" expects a size and optional fill value', {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }
  const size = parseRawDataSizeExpr(parts[0]!, lineSpan, filePath, diagnostics);
  if (!size) return undefined;
  const fill =
    parts.length === 2 && parts[1]!.length > 0
      ? parseImmExprFromText(filePath, parts[1]!, lineSpan, diagnostics)
      : undefined;
  if (parts.length === 2 && !fill) return undefined;
  return {
    kind: 'AsmRawData',
    span: lineSpan,
    name: '',
    directive: 'ds',
    size,
    ...(fill ? { fill } : {}),
    valuesText: sizeText,
  };
}

/**
 * Parses a `db`/`dw`/`ds` line with no leading label (continuation bytes after a labeled block).
 */
export function parseBareRawDataDirective(
  directiveText: string,
  lineNo: number,
  lineSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
): AsmRawDataNode | undefined {
  return parseNamedRawDataDirective('', directiveText, lineNo, lineSpan, filePath, diagnostics);
}

function parseNamedRawDataDirective(
  name: string,
  directiveText: string,
  lineNo: number,
  lineSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
): AsmRawDataNode | undefined {
  const match = /^(db|dw|ds)\b(.*)$/i.exec(directiveText.trim());
  if (!match) return undefined;
  const directive = match[1]!.toLowerCase() as 'db' | 'dw' | 'ds';
  const payload = match[2]!.trim();
  const parsed =
    directive === 'ds'
      ? parseRawDataSizeOperands(payload, lineNo, lineSpan, filePath, diagnostics)
      : parseRawDataValues(directive, payload, lineNo, lineSpan, filePath, diagnostics);
  if (!parsed) return undefined;
  return { ...parsed, name, span: lineSpan };
}
