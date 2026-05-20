import { DiagnosticIds, type Diagnostic } from './diagnosticTypes.js';
import type { AsmItemNode, OpDeclNode, ProgramNode, SourceSpan } from './frontend/ast.js';
import type { CaseStyleMode } from './pipeline.js';

type TokenStyle = 'upper' | 'lower' | 'mixed';
type NormalizedStyle = Exclude<TokenStyle, 'mixed'>;

const REGISTER_RE =
  /(?<![A-Za-z0-9_$])(AF'|AF|BC|DE|HL|SP|IXH|IXL|IYH|IYL|IX|IY|A|B|C|D|E|H|L|I|R)(?![A-Za-z0-9_])/gi;

function classifyTokenStyle(token: string): TokenStyle | undefined {
  const letters = token.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return undefined;
  if (letters === letters.toUpperCase()) return 'upper';
  if (letters === letters.toLowerCase()) return 'lower';
  return 'mixed';
}

function sourceSliceBySpan(source: string, span: SourceSpan): string {
  const start = Math.max(0, Math.min(source.length, span.start.offset));
  const end = Math.max(start, Math.min(source.length, span.end.offset));
  return source.slice(start, end);
}

function stripLeadingLabel(text: string): string {
  return text.replace(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*/, '');
}

function scrubCharLiterals(text: string): string {
  let out = '';
  let inChar = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (!inChar) {
      if (ch === "'") {
        inChar = true;
        escaped = false;
        out += ' ';
        continue;
      }
      out += ch;
      continue;
    }

    out += ' ';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === "'") {
      inChar = false;
    }
  }
  return out;
}

type CaseStyleState = {
  consistentStyle: NormalizedStyle | undefined;
};

function lintToken(
  mode: CaseStyleMode,
  state: CaseStyleState,
  token: string,
  category: 'mnemonic' | 'keyword' | 'register',
  span: SourceSpan,
  diagnostics: Diagnostic[],
): void {
  if (mode === 'off') return;
  const style = classifyTokenStyle(token);
  if (!style) return;

  if (mode === 'consistent') {
    if (!state.consistentStyle && (style === 'upper' || style === 'lower')) {
      state.consistentStyle = style;
      return;
    }
    const expected = state.consistentStyle;
    if (!expected) return;
    if (style !== expected) {
      diagnostics.push({
        id: DiagnosticIds.CaseStyleLint,
        severity: 'warning',
        message: `Case-style lint: ${category} "${token}" does not match established ${expected}case style under --case-style=consistent.`,
        file: span.file,
        line: span.start.line,
        column: span.start.column,
      });
    }
    return;
  }

  if (style === mode) return;
  const expectedText = mode === 'upper' ? 'uppercase' : 'lowercase';
  diagnostics.push({
    id: DiagnosticIds.CaseStyleLint,
    severity: 'warning',
    message: `Case-style lint: ${category} "${token}" should be ${expectedText} under --case-style=${mode}.`,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

function lintAsmItems(
  items: AsmItemNode[],
  source: string,
  mode: CaseStyleMode,
  state: CaseStyleState,
  diagnostics: Diagnostic[],
): void {
  for (const item of items) {
    const text = stripLeadingLabel(sourceSliceBySpan(source, item.span)).trim();
    if (text.length === 0) continue;

    if (item.kind === 'AsmInstruction') {
      const mnemonic = text.split(/\s+/, 1)[0] ?? '';
      if (mnemonic.length > 0) {
        lintToken(mode, state, mnemonic, 'mnemonic', item.span, diagnostics);
      }

      const scrubbed = scrubCharLiterals(text);
      for (const match of scrubbed.matchAll(REGISTER_RE)) {
        const raw = match[1];
        if (!raw) continue;
        lintToken(mode, state, raw, 'register', item.span, diagnostics);
      }
      continue;
    }

  }
}

export function lintCaseStyle(
  program: ProgramNode,
  sourceTexts: Map<string, string>,
  mode: CaseStyleMode,
  diagnostics: Diagnostic[],
): void {
  if (mode === 'off') return;

  const state: CaseStyleState = { consistentStyle: undefined };
  for (const sourceFileNode of program.files) {
    const source = sourceTexts.get(sourceFileNode.path);
    if (!source) continue;
    for (const item of sourceFileNode.items) {
      if (item.kind === 'AsmInstruction') {
        lintAsmItems([item], source, mode, state, diagnostics);
        continue;
      }
      if (item.kind === 'OpDecl') {
        lintAsmItems((item as OpDeclNode).body.items, source, mode, state, diagnostics);
      }
    }
  }
}
