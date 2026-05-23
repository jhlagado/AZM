import type { Diagnostic } from '../../diagnosticTypes.js';
import type { SourceSpan } from '../ast.js';
import { parseImmExprFromText } from '../parseImm.js';
import { advanceAsmQuoteScan, createAsmQuoteScanState } from './quoteScan.js';

export function parseAsmRawValues(
  path: string,
  valuesText: string,
  lineSpan: SourceSpan,
  diagnostics: Diagnostic[],
  stringEquates: Map<string, string>,
): unknown[] {
  const out: unknown[] = [];
  const parts = splitTopLevelComma(valuesText)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const part of parts) {
    const rawString = parseWholeQuotedString(part);
    if (rawString !== undefined) {
      if (part[0] === "'" && rawString.length === 1) {
        const expr = parseImmExprFromText(path, part, lineSpan, diagnostics);
        if (expr) {
          out.push(expr);
          continue;
        }
      }
      out.push({ kind: 'AsmString', value: rawString });
      continue;
    }
    const stringEquate = /^[A-Za-z_][A-Za-z0-9_]*$/.exec(part)
      ? stringEquates.get(part.toLowerCase())
      : undefined;
    if (stringEquate !== undefined) {
      out.push({ kind: 'AsmString', value: stringEquate });
      continue;
    }
    const expr = parseImmExprFromText(
      path,
      normalizeDoubleQuotedCharExpr(part),
      lineSpan,
      diagnostics,
    );
    if (expr) out.push(expr);
  }
  return out;
}

export function parseWholeQuotedString(text: string): string | undefined {
  if (text.length < 2) return undefined;
  const quote = text[0];
  if ((quote !== '"' && quote !== "'") || text[text.length - 1] !== quote) return undefined;

  let value = '';
  for (let i = 1; i < text.length - 1; i++) {
    const ch = text[i]!;
    if (ch === '\\') {
      if (i + 1 >= text.length - 1) return undefined;
      value += text[i + 1]!;
      i++;
      continue;
    }
    if (ch === quote) return undefined;
    value += ch;
  }
  return value;
}

function normalizeDoubleQuotedCharExpr(text: string): string {
  return text.replace(/"([^"\\])"/g, (_match, char: string) => `'${char}'`);
}

function splitTopLevelComma(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const quoteState = createAsmQuoteScanState();
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    if (advanceAsmQuoteScan(text, i, quoteState)) continue;
    if (quoteState.inString || quoteState.inChar) continue;
    const ch = text[i]!;
    if (ch === '(') {
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
