import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { TOP_LEVEL_KEYWORDS } from './grammarData.js';

export { TOP_LEVEL_KEYWORDS } from './grammarData.js';

export const malformedTopLevelHeaderExpectations: ReadonlyArray<{
  keyword: string;
  kind: string;
  expected: string;
}> = [
  { keyword: 'type', kind: 'type declaration', expected: '<name> [<typeExpr>]' },
  { keyword: 'union', kind: 'union declaration', expected: '<name>' },
  { keyword: 'op', kind: 'op header', expected: '<name>(...)' },
  { keyword: 'enum', kind: 'enum declaration', expected: '<name> <member>[, ...]' },
  { keyword: 'align', kind: 'align directive', expected: '<imm16>' },
  { keyword: 'const', kind: 'const declaration', expected: '<name> = <imm>' },
  { keyword: 'bin', kind: 'bin declaration', expected: '<name> in <code|data> from "<path>"' },
  { keyword: 'hex', kind: 'hex declaration', expected: '<name> from "<path>"' },
];

export const unsupportedExportTargetKind: Readonly<Partial<Record<string, string>>> = {
  type: 'type declarations',
  union: 'union declarations',
  enum: 'enum declarations',
  align: 'align directives',
  bin: 'bin declarations',
  hex: 'hex declarations',
};

export function consumeKeywordPrefix(input: string, keyword: string): string | undefined {
  const match = new RegExp(`^${keyword}(?:\\s+(.*))?$`, 'i').exec(input);
  if (!match) return undefined;
  return (match[1] ?? '').trimStart();
}

export function topLevelStartKeyword(t: string): string | undefined {
  const exportTail = consumeKeywordPrefix(t, 'export');
  const w = exportTail !== undefined ? exportTail : t;
  const keyword = (w.split(/\s/, 1)[0] ?? '').toLowerCase();
  return TOP_LEVEL_KEYWORDS.has(keyword) ? keyword : undefined;
}

export function isTopLevelStart(t: string): boolean {
  return topLevelStartKeyword(t) !== undefined;
}

export function consumeTopKeyword(input: string, keyword: string): string | undefined {
  return consumeKeywordPrefix(input, keyword);
}

export function looksLikeKeywordBodyDeclLine(lineText: string): boolean {
  const t = lineText.trim();
  let depth = 0;
  let colon = -1;
  for (let index = 0; index < t.length; index++) {
    const ch = t[index];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === ':' && depth === 0) {
      colon = index;
      break;
    }
  }
  if (colon <= 0) return false;
  const beforeColon = t.slice(0, colon).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(\s*\([^)]*\))?\s*$/.test(beforeColon);
}

function quoteDiagLineText(text: string): string {
  const trimmed = text.trim();
  const preview = trimmed.length > 96 ? `${trimmed.slice(0, 93)}...` : trimmed;
  return preview.replace(/"/g, '\\"');
}

export function diagInvalidBlockLine(
  diagnostics: Diagnostic[],
  modulePath: string,
  kind: string,
  lineText: string,
  expected: string,
  line: number,
): void {
  const q = quoteDiagLineText(lineText);
  diag(diagnostics, modulePath, `Invalid ${kind} line "${q}": expected ${expected}`, {
    line,
    column: 1,
  });
}

export function diagInvalidHeaderLine(
  diagnostics: Diagnostic[],
  modulePath: string,
  kind: string,
  lineText: string,
  expected: string,
  line: number,
): void {
  const q = quoteDiagLineText(lineText);
  diag(diagnostics, modulePath, `Invalid ${kind} line "${q}": expected ${expected}`, {
    line,
    column: 1,
  });
}

export function formatIdentifierToken(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return '<empty>';
  return `"${trimmed.replace(/"/g, '\\"')}"`;
}
