import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { splitInstructionChain } from '../source/instruction-chain.js';
import { stripLineComment } from '../source/strip-line-comment.js';
import { IDENTIFIER_PATTERN } from '../syntax/names.js';

export type CaseStyleMode = 'off' | 'upper' | 'lower' | 'consistent';

type TokenStyle = 'upper' | 'lower' | 'mixed';
type NormalizedStyle = Exclude<TokenStyle, 'mixed'>;

const REGISTER_RE =
  /(?<![A-Za-z0-9_$])(AF'|AF|BC|DE|HL|SP|IXH|IXL|IYH|IYL|IX|IY|A|B|C|D|E|H|L|I|R)(?![A-Za-z0-9_])/gi;

interface CaseStyleState {
  consistentStyle: NormalizedStyle | undefined;
}

interface CaseStyleLineState {
  inOpBody: boolean;
}

export function lintCaseStyleNext(options: {
  readonly items: readonly SourceItem[];
  readonly sourceTexts: ReadonlyMap<string, string>;
  readonly mode: CaseStyleMode;
}): readonly Diagnostic[] {
  if (options.mode === 'off') return [];

  const diagnostics: Diagnostic[] = [];
  const state: CaseStyleState = { consistentStyle: undefined };
  const sourceLines = buildSourceLineMap(options.sourceTexts);
  const instructionLines = new Set<string>();

  for (const item of options.items) {
    if (item.kind !== 'instruction') continue;
    instructionLines.add(lineKey(item.span.sourceName, item.span.line));
  }

  lintSourceLines(sourceLines, instructionLines, options.mode, state, diagnostics);

  return diagnostics;
}

function buildSourceLineMap(sourceTexts: ReadonlyMap<string, string>): Map<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();
  for (const [sourceName, text] of sourceTexts) {
    result.set(sourceName, text.split(/\r?\n/));
  }
  return result;
}

function lintInstructionLine(
  rawLine: string,
  sourceName: string,
  line: number,
  mode: CaseStyleMode,
  state: CaseStyleState,
  diagnostics: Diagnostic[],
): void {
  const segments = splitInstructionChain(rawLine);
  if (segments !== undefined) {
    for (let index = 0; index < segments.length; index += 1) {
      const stripped = index === 0
        ? stripLeadingLabelsWithOffset(segments[index]!.text)
        : { text: segments[index]!.text, offset: 0 };
      lintInstructionSegment(
        stripped.text.trim(),
        segments[index]!.column + stripped.offset + firstColumn(stripped.text) - 1,
        sourceName,
        line,
        mode,
        state,
        diagnostics,
      );
    }
    return;
  }

  const stripped = stripLeadingLabelsWithOffset(stripLineComment(rawLine));
  lintInstructionSegment(
    stripped.text.trim(),
    stripped.offset + firstColumn(stripped.text),
    sourceName,
    line,
    mode,
    state,
    diagnostics,
  );
}

function lintInstructionSegment(
  text: string,
  baseColumn: number,
  sourceName: string,
  line: number,
  mode: CaseStyleMode,
  state: CaseStyleState,
  diagnostics: Diagnostic[],
): void {
  if (text.length === 0) return;

  const mnemonic = text.split(/\s+/, 1)[0] ?? '';
  if (mnemonic.length > 0) {
    lintToken(mode, state, mnemonic, 'mnemonic', sourceName, line, baseColumn, diagnostics);
  }

  const scrubbed = scrubCharLiterals(text);
  for (const match of scrubbed.matchAll(REGISTER_RE)) {
    const raw = match[1];
    if (!raw) continue;
    lintToken(
      mode,
      state,
      raw,
      'register',
      sourceName,
      line,
      baseColumn + match.index,
      diagnostics,
    );
  }
}

function lintSourceLines(
  sourceLines: ReadonlyMap<string, readonly string[]>,
  instructionLines: ReadonlySet<string>,
  mode: CaseStyleMode,
  state: CaseStyleState,
  diagnostics: Diagnostic[],
): void {
  for (const [sourceName, lines] of sourceLines) {
    const lineState: CaseStyleLineState = { inOpBody: false };
    for (let index = 0; index < lines.length; index += 1) {
      const line = index + 1;
      const rawLine = lines[index] ?? '';
      if (shouldLintCaseStyleLine(rawLine, sourceName, line, instructionLines, lineState)) {
        lintInstructionLine(rawLine, sourceName, line, mode, state, diagnostics);
      }
    }
  }
}

function shouldLintCaseStyleLine(
  rawLine: string,
  sourceName: string,
  line: number,
  instructionLines: ReadonlySet<string>,
  state: CaseStyleLineState,
): boolean {
  const text = stripLeadingLabels(stripLineComment(rawLine)).trim();
  if (text.length === 0) return false;
  if (isOpHeaderLine(text)) {
    state.inOpBody = true;
    return false;
  }
  if (state.inOpBody && isOpEndLine(text)) {
    state.inOpBody = false;
    return false;
  }
  return (
    state.inOpBody ||
    instructionLines.has(lineKey(sourceName, line)) ||
    isPotentialOpInvocationLine(text)
  );
}

function isOpHeaderLine(text: string): boolean {
  return new RegExp(`^op\\s+${IDENTIFIER_PATTERN}\\s*\\(`, 'i').test(text);
}

function isOpEndLine(text: string): boolean {
  return /^end\s*$/i.test(text);
}

function isPotentialOpInvocationLine(text: string): boolean {
  if (!new RegExp(`^${IDENTIFIER_PATTERN}(?:\\s+.*)?$`).test(text)) return false;
  if (new RegExp(`^${IDENTIFIER_PATTERN}\\s+\\.?equ\\b`, 'i').test(text)) return false;
  if (new RegExp(`^${IDENTIFIER_PATTERN}\\s+\\.(?:enum|type|union|typealias|field|byte|word|addr)\\b`).test(text)) {
    return false;
  }
  if (/^(?:op|end|enum|type|union|field|byte|word|addr)\b/i.test(text)) return false;
  if (/^(?:org|equ|db|dw|ds|align|include|binfrom|binto|cstr|pstr|istr)\b/i.test(text)) {
    return false;
  }
  return true;
}

function lineKey(sourceName: string, line: number): string {
  return `${sourceName}:${line}`;
}

function lintToken(
  mode: CaseStyleMode,
  state: CaseStyleState,
  token: string,
  category: 'mnemonic' | 'register',
  sourceName: string,
  line: number,
  column: number,
  diagnostics: Diagnostic[],
): void {
  const style = classifyTokenStyle(token);
  if (!style) return;

  if (mode === 'consistent') {
    lintConsistentToken(state, style, token, category, sourceName, line, column, diagnostics);
    return;
  }

  if (mode === 'off') return;
  lintFixedStyleToken(mode, style, token, category, sourceName, line, column, diagnostics);
}

function lintConsistentToken(
  state: CaseStyleState,
  style: TokenStyle,
  token: string,
  category: 'mnemonic' | 'register',
  sourceName: string,
  line: number,
  column: number,
  diagnostics: Diagnostic[],
): void {
  if (!state.consistentStyle && (style === 'upper' || style === 'lower')) {
    state.consistentStyle = style;
    return;
  }

  const expected = state.consistentStyle;
  if (!expected || style === expected) return;
  diagnostics.push({
    severity: 'warning',
    code: 'AZMN_CASE_STYLE',
    message: `Case-style lint: ${category} "${token}" does not match established ${expected}case style under --case-style=consistent.`,
    sourceName,
    line,
    column,
  });
}

function lintFixedStyleToken(
  mode: Exclude<CaseStyleMode, 'off' | 'consistent'>,
  style: TokenStyle,
  token: string,
  category: 'mnemonic' | 'register',
  sourceName: string,
  line: number,
  column: number,
  diagnostics: Diagnostic[],
): void {
  if (style === mode) return;
  const expectedText = mode === 'upper' ? 'uppercase' : 'lowercase';
  diagnostics.push({
    severity: 'warning',
    code: 'AZMN_CASE_STYLE',
    message: `Case-style lint: ${category} "${token}" should be ${expectedText} under --case-style=${mode}.`,
    sourceName,
    line,
    column,
  });
}

function classifyTokenStyle(token: string): TokenStyle | undefined {
  const letters = token.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return undefined;
  if (letters === letters.toUpperCase()) return 'upper';
  if (letters === letters.toLowerCase()) return 'lower';
  return 'mixed';
}

function stripLeadingLabels(text: string): string {
  return stripLeadingLabelsWithOffset(text).text;
}

function stripLeadingLabelsWithOffset(text: string): { readonly text: string; readonly offset: number } {
  let remaining = text;
  let offset = 0;
  while (true) {
    const match = /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*\s*:\s*/.exec(remaining);
    if (!match) return { text: remaining, offset };
    const stripped = remaining.slice(match[0].length);
    if (stripped === remaining) return { text: remaining, offset };
    remaining = stripped;
    offset += match[0].length;
  }
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}

function scrubCharLiterals(text: string): string {
  let output = '';
  let inChar = false;
  let escaped = false;

  for (const char of text) {
    if (!inChar) {
      if (char === "'") {
        inChar = true;
        escaped = false;
        output += ' ';
        continue;
      }
      output += char;
      continue;
    }

    output += ' ';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === "'") {
      inChar = false;
    }
  }

  return output;
}
