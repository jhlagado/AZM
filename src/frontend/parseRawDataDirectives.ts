import type { Diagnostic } from '../diagnosticTypes.js';

import type { ImmExprNode, RawDataDeclNode, SourceSpan } from './ast.js';
import { parseImmExprFromText } from './parseImm.js';
import { parseDiag as diag } from './parseDiagnostics.js';

export type PendingRawLabel = {
  name: string;
  span: SourceSpan;
  lineNo: number;
  filePath: string;
};

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
): RawDataDeclNode | undefined {
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
  return { kind: 'RawDataDecl', span: lineSpan, name: '', directive, values };
}

function parseRawDataSize(
  sizeText: string,
  lineNo: number,
  lineSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
): RawDataDeclNode | undefined {
  const parts = splitTopLevelComma(sizeText).map((part) => part.trim());
  if (parts.length !== 1 || parts[0]!.length === 0) {
    diag(diagnostics, filePath, '"ds" expects a single imm expression size', {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }
  const expr = parseImmExprFromText(filePath, parts[0]!, lineSpan, diagnostics);
  if (!expr) return undefined;
  return { kind: 'RawDataDecl', span: lineSpan, name: '', directive: 'ds', size: expr };
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
): RawDataDeclNode | undefined {
  const match = /^(db|dw|ds)\b(.*)$/i.exec(directiveText.trim());
  if (!match) return undefined;
  const directive = match[1]!.toLowerCase() as 'db' | 'dw' | 'ds';
  const payload = match[2]!.trim();
  const parsed =
    directive === 'ds'
      ? parseRawDataSize(payload, lineNo, lineSpan, filePath, diagnostics)
      : parseRawDataValues(directive, payload, lineNo, lineSpan, filePath, diagnostics);
  if (!parsed) return undefined;
  return { ...parsed, name: '', span: lineSpan };
}

export function parseRawDataDirective(
  label: PendingRawLabel,
  directiveText: string,
  lineNo: number,
  lineSpan: SourceSpan,
  filePath: string,
  diagnostics: Diagnostic[],
): RawDataDeclNode | undefined {
  const match = /^(db|dw|ds)\b(.*)$/i.exec(directiveText.trim());
  if (!match) return undefined;
  const directive = match[1]!.toLowerCase() as 'db' | 'dw' | 'ds';
  const payload = match[2]!.trim();
  const parsed =
    directive === 'ds'
      ? parseRawDataSize(payload, lineNo, lineSpan, filePath, diagnostics)
      : parseRawDataValues(directive, payload, lineNo, lineSpan, filePath, diagnostics);
  if (!parsed) return undefined;
  return { ...parsed, name: label.name, span: lineSpan };
}