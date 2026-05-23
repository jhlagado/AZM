import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { TOP_LEVEL_KEYWORDS } from './grammarData.js';

export const malformedTopLevelHeaderExpectations: ReadonlyArray<{
  keyword: string;
  kind: string;
  expected: string;
}> = [
  { keyword: 'type', kind: 'type declaration', expected: '<name>' },
  { keyword: 'union', kind: 'union declaration', expected: '<name>' },
  { keyword: 'op', kind: 'op header', expected: '<name>(...)' },
  { keyword: 'enum', kind: 'enum declaration', expected: '<name> <member>[, ...]' },
];

function consumeKeywordPrefix(input: string, keyword: string): string | undefined {
  const match = new RegExp(`^\\.?${keyword}(?:\\s+(.*))?$`, 'i').exec(input);
  if (!match) return undefined;
  return (match[1] ?? '').trimStart();
}

export function topLevelStartKeyword(t: string): string | undefined {
  const rawKeyword = (t.split(/\s/, 1)[0] ?? '').toLowerCase();
  if (!rawKeyword.startsWith('.') && (rawKeyword === 'type' || rawKeyword === 'union')) {
    return undefined;
  }
  const keyword = rawKeyword.startsWith('.') ? rawKeyword.slice(1) : rawKeyword;
  return TOP_LEVEL_KEYWORDS.has(keyword) ? keyword : undefined;
}

export function consumeTopKeyword(input: string, keyword: string): string | undefined {
  return consumeKeywordPrefix(input, keyword);
}

function quoteDiagLineText(text: string): string {
  const trimmed = text.trim();
  const preview = trimmed.length > 96 ? `${trimmed.slice(0, 93)}...` : trimmed;
  return preview.replace(/"/g, '\\"');
}

export function diagInvalidBlockLine(
  diagnostics: Diagnostic[],
  sourcePath: string,
  kind: string,
  lineText: string,
  expected: string,
  line: number,
): void {
  const q = quoteDiagLineText(lineText);
  diag(diagnostics, sourcePath, `Invalid ${kind} line "${q}": expected ${expected}`, {
    line,
    column: 1,
  });
}

export function diagInvalidHeaderLine(
  diagnostics: Diagnostic[],
  sourcePath: string,
  kind: string,
  lineText: string,
  expected: string,
  line: number,
): void {
  const q = quoteDiagLineText(lineText);
  diag(diagnostics, sourcePath, `Invalid ${kind} line "${q}": expected ${expected}`, {
    line,
    column: 1,
  });
}

export function formatIdentifierToken(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return '<empty>';
  return `"${trimmed.replace(/"/g, '\\"')}"`;
}
