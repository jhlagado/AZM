import type { AsmOperandNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseAsmOperand } from './parseOperands.js';

type ParsedControlKeywordText =
  | { kind: 'missing' }
  | { kind: 'value'; value: string }
  | { kind: 'invalid' };

type ParsedSelectOperand =
  | { kind: 'missing' }
  | { kind: 'value'; value: AsmOperandNode }
  | { kind: 'invalid' };

export function isBareAsmControlKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase() === keyword;
}

export function parseAsmConditionKeyword(
  text: string,
  keyword: 'if' | 'while' | 'until',
): ParsedControlKeywordText {
  const match = new RegExp(`^${keyword}\\s+([A-Za-z][A-Za-z0-9]*)$`, 'i').exec(text);
  if (match) return { kind: 'value', value: match[1]! };
  return isBareAsmControlKeyword(text, keyword) ? { kind: 'missing' } : { kind: 'invalid' };
}

export function parseAsmKeywordTail(
  text: string,
  keyword: 'select' | 'case',
): ParsedControlKeywordText {
  const match = new RegExp(`^${keyword}\\s+(.+)$`, 'i').exec(text);
  if (match) return { kind: 'value', value: match[1]!.trim() };
  return isBareAsmControlKeyword(text, keyword) ? { kind: 'missing' } : { kind: 'invalid' };
}

export function parseSelectOperandFromText(
  filePath: string,
  text: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
): ParsedSelectOperand {
  const parsed = parseAsmKeywordTail(text, 'select');
  if (parsed.kind !== 'value') return parsed;
  const selector = parseAsmOperand(filePath, parsed.value, stmtSpan, diagnostics, false);
  return selector ? { kind: 'value', value: selector } : { kind: 'invalid' };
}
