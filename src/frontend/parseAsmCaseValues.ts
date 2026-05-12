import type { ImmExprNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseImmExprFromText } from './parseImm.js';

export type ParsedCaseItem = { value: ImmExprNode; end?: ImmExprNode };

function splitTopLevelCaseText(caseText: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inChar = false;
  let escaped = false;

  for (let i = 0; i < caseText.length; i++) {
    const ch = caseText[i]!;
    if (inChar) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === "'") {
        inChar = false;
      }
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
      parts.push(caseText.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(caseText.slice(start));
  return parts;
}

function findTopLevelRangeSeparator(caseText: string): number | undefined {
  let rangeStart: number | undefined;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inChar = false;
  let escaped = false;

  for (let i = 0; i < caseText.length; i++) {
    const ch = caseText[i]!;
    if (inChar) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === "'") {
        inChar = false;
      }
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
    if (
      ch === '.' &&
      caseText[i + 1] === '.' &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      if (rangeStart !== undefined) return undefined;
      rangeStart = i;
      i++;
    }
  }

  return rangeStart;
}

function parseCaseItemFromText(
  filePath: string,
  caseText: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
): ParsedCaseItem | undefined {
  const rangeStart = findTopLevelRangeSeparator(caseText);
  if (rangeStart === undefined) {
    const value = parseImmExprFromText(filePath, caseText, stmtSpan, diagnostics, false);
    return value ? { value } : undefined;
  }

  const startText = caseText.slice(0, rangeStart).trim();
  const endText = caseText.slice(rangeStart + 2).trim();
  if (startText.length === 0 || endText.length === 0) return undefined;
  const value = parseImmExprFromText(filePath, startText, stmtSpan, diagnostics, false);
  const end = parseImmExprFromText(filePath, endText, stmtSpan, diagnostics, false);
  if (!value || !end) return undefined;
  return { value, end };
}

export function parseCaseValuesFromText(
  filePath: string,
  caseText: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
): ParsedCaseItem[] | undefined {
  const values: ParsedCaseItem[] = [];
  for (const rawPart of splitTopLevelCaseText(caseText)) {
    const part = rawPart.trim();
    if (part.length === 0) return undefined;
    const value = parseCaseItemFromText(filePath, part, stmtSpan, diagnostics);
    if (!value) return undefined;
    values.push(value);
  }
  return values.length > 0 ? values : undefined;
}
