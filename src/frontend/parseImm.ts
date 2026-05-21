import type { ImmExprNode, OffsetPathNode, SourceSpan, TypeExprNode } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import {
  CHAR_ESCAPE_VALUES,
  IMM_BINARY_OPERATORS,
  IMM_BINARY_OPERATOR_PRECEDENCE,
  IMM_MULTI_CHAR_OPERATORS,
  IMM_UNARY_OPERATOR_SET,
} from './grammarData.js';

type ImmUnaryOp = Extract<ImmExprNode, { kind: 'ImmUnary' }>['op'];
type ImmBinaryOp = Extract<ImmExprNode, { kind: 'ImmBinary' }>['op'];
type ImmOpToken = ImmUnaryOp | ImmBinaryOp;

export function immLiteral(filePath: string, s: SourceSpan, value: number): ImmExprNode {
  return { kind: 'ImmLiteral', span: { ...s, file: filePath }, value };
}

function immName(filePath: string, s: SourceSpan, name: string): ImmExprNode {
  return { kind: 'ImmName', span: { ...s, file: filePath }, name };
}

export function parseTypeExprFromText(
  typeText: string,
  typeSpan: SourceSpan,
  opts: { allowInferredArrayLength: boolean },
): TypeExprNode | undefined {
  let rest = typeText.trim();
  if (rest.startsWith('@')) {
    const inner = parseTypeExprFromText(rest.slice(1).trim(), typeSpan, opts);
    if (!inner) return undefined;
    return { kind: 'AddrOfType', span: typeSpan, target: inner };
  }
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/.exec(rest);
  if (!nameMatch) return undefined;
  const name = nameMatch[1]!;
  rest = rest.slice(name.length).trimStart();

  let typeExpr: TypeExprNode = { kind: 'TypeName', span: typeSpan, name };

  while (rest.startsWith('[')) {
    const m = /^\[\s*([0-9]+)?\s*\]/.exec(rest);
    if (!m) return undefined;
    const lenText = m[1];
    if (lenText === undefined && !opts.allowInferredArrayLength) return undefined;
    typeExpr =
      lenText === undefined
        ? { kind: 'ArrayType', span: typeSpan, element: typeExpr }
        : {
            kind: 'ArrayType',
            span: typeSpan,
            element: typeExpr,
            length: Number.parseInt(lenText, 10),
          };
    rest = rest.slice(m[0].length).trimStart();
  }

  if (rest.length > 0) return undefined;
  return typeExpr;
}

export function diagIfInferredArrayLengthNotAllowed(
  diagnostics: Diagnostic[],
  filePath: string,
  typeText: string,
  where: { line: number; column: number },
): boolean {
  if (!/\[\s*\]/.test(typeText)) return false;
  diag(
    diagnostics,
    filePath,
    `Inferred-length arrays (T[]) are only permitted in data declarations with an initializer.`,
    where,
  );
  return true;
}

export function parseNumberLiteral(text: string): number | undefined {
  const t = text.trim();
  if (/^[0-9][0-9A-Fa-f]*[Hh]$/.test(t)) {
    return Number.parseInt(t.slice(0, -1), 16);
  }
  if (/^[01]+[Bb]$/.test(t)) {
    return Number.parseInt(t.slice(0, -1), 2);
  }
  if (/^\$[0-9A-Fa-f]+$/.test(t)) {
    return Number.parseInt(t.slice(1), 16);
  }
  if (/^%[01]+$/.test(t)) {
    return Number.parseInt(t.slice(1), 2);
  }
  if (/^0b[01]+$/.test(t)) {
    return Number.parseInt(t.slice(2), 2);
  }
  if (/^0x[0-9A-Fa-f]+$/i.test(t)) {
    return Number.parseInt(t.slice(2), 16);
  }
  if (/^[0-9]+$/.test(t)) {
    return Number.parseInt(t, 10);
  }
  return undefined;
}

type ImmToken =
  | { kind: 'num'; text: string }
  | { kind: 'current' }
  | { kind: 'ident'; text: string }
  | { kind: 'op'; text: ImmOpToken }
  | { kind: 'comma' }
  | { kind: 'dot' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'lbrack' }
  | { kind: 'rbrack' };

function isImmUnaryOp(op: ImmOpToken): op is ImmUnaryOp {
  return IMM_UNARY_OPERATOR_SET.has(op);
}

function isImmBinaryOp(op: ImmOpToken): op is ImmBinaryOp {
  return IMM_BINARY_OPERATORS.has(op);
}

function isImmOpToken(text: string): text is ImmOpToken {
  return IMM_UNARY_OPERATOR_SET.has(text) || IMM_BINARY_OPERATORS.has(text);
}

function tokenizeImm(text: string): ImmToken[] | undefined {
  const out: ImmToken[] = [];
  let i = 0;
  const s = text.trim();
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      out.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      out.push({ kind: 'comma' });
      i++;
      continue;
    }
    if (ch === '.') {
      out.push({ kind: 'dot' });
      i++;
      continue;
    }
    if (ch === ')') {
      out.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === '[') {
      out.push({ kind: 'lbrack' });
      i++;
      continue;
    }
    if (ch === ']') {
      out.push({ kind: 'rbrack' });
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (IMM_MULTI_CHAR_OPERATORS.has(two)) {
      out.push({ kind: 'op', text: two as ImmOpToken });
      i += 2;
      continue;
    }
    if (ch === '$') {
      if (/^[0-9A-Fa-f]/.test(s[i + 1] ?? '')) {
        const num = /^\$[0-9A-Fa-f]+/.exec(s.slice(i));
        if (!num) return undefined;
        out.push({ kind: 'num', text: num[0] });
        i += num[0].length;
        continue;
      }
      if (/^[A-Za-z_]/.test(s[i + 1] ?? '')) return undefined;
      out.push({ kind: 'current' });
      i++;
      continue;
    }
    if (ch === "'") {
      i++;
      if (i >= s.length) return undefined;

      let value: number | undefined;
      if (s[i] === '\\') {
        i++;
        if (i >= s.length) return undefined;
        const esc = s[i]!;
        i++;
        if (esc === 'x') {
          const hex = s.slice(i, i + 2);
          if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return undefined;
          value = Number.parseInt(hex, 16);
          i += 2;
        } else {
          const escaped = CHAR_ESCAPE_VALUES.get(esc);
          if (escaped === undefined) return undefined;
          value = escaped;
        }
      } else {
        if (s[i] === "'" || s[i] === '\n' || s[i] === '\r') return undefined;
        const cp = s.codePointAt(i);
        if (cp === undefined) return undefined;
        value = cp;
        i += cp > 0xffff ? 2 : 1;
      }

      if (i >= s.length || s[i] !== "'") return undefined;
      i++;
      out.push({ kind: 'num', text: String(value) });
      continue;
    }
    if (ch === '"') {
      i++;
      if (i >= s.length) return undefined;

      let value: number | undefined;
      if (s[i] === '\\') {
        i++;
        if (i >= s.length) return undefined;
        const esc = s[i]!;
        i++;
        if (esc === 'x') {
          const hex = s.slice(i, i + 2);
          if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return undefined;
          value = Number.parseInt(hex, 16);
          i += 2;
        } else {
          const escaped = CHAR_ESCAPE_VALUES.get(esc);
          if (escaped === undefined) return undefined;
          value = escaped;
        }
      } else {
        if (s[i] === '"' || s[i] === '\n' || s[i] === '\r') return undefined;
        const cp = s.codePointAt(i);
        if (cp === undefined) return undefined;
        value = cp;
        i += cp > 0xffff ? 2 : 1;
      }

      if (i >= s.length || s[i] !== '"') return undefined;
      i++;
      out.push({ kind: 'num', text: String(value) });
      continue;
    }
    const num =
      /^([0-9][0-9A-Fa-f]*[Hh]|%[01]+|0b[01]+|0x[0-9A-Fa-f]+|[01]+[Bb]|[0-9]+)/i.exec(
        s.slice(i),
      );
    if (num) {
      out.push({ kind: 'num', text: num[0] });
      i += num[0].length;
      continue;
    }
    if (isImmOpToken(ch)) {
      out.push({ kind: 'op', text: ch });
      i++;
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (ident) {
      out.push({ kind: 'ident', text: ident[0] });
      i += ident[0].length;
      continue;
    }
    return undefined;
  }
  return out;
}

export function parseImmExprFromText(
  filePath: string,
  exprText: string,
  exprSpan: SourceSpan,
  diagnostics: Diagnostic[],
  emitDiagnostics = true,
): ImmExprNode | undefined {
  const tokenized = tokenizeImm(exprText);
  if (!tokenized) {
    if (emitDiagnostics) {
      diag(diagnostics, filePath, `Invalid imm expression: ${exprText}`, {
        line: exprSpan.start.line,
        column: exprSpan.start.column,
      });
    }
    return undefined;
  }

  const tokens = tokenized;
  let idx = 0;

  function parseDottedIdentName(): string | undefined {
    const first = tokens[idx];
    if (!first || first.kind !== 'ident') return undefined;
    const parts = [first.text];
    idx++;
    while (tokens[idx]?.kind === 'dot') {
      const next = tokens[idx + 1];
      if (!next || next.kind !== 'ident') return undefined;
      parts.push(next.text);
      idx += 2;
    }
    return parts.join('.');
  }

  function parseBuiltinTypeExprArg(): TypeExprNode | undefined {
    const name = parseDottedIdentName();
    if (!name) return undefined;
    let typeExpr: TypeExprNode = { kind: 'TypeName', span: exprSpan, name };
    while (tokens[idx]?.kind === 'lbrack') {
      idx++;
      const lenTok = tokens[idx];
      if (!lenTok || lenTok.kind !== 'num') return undefined;
      if (!/^[0-9]+$/.test(lenTok.text)) return undefined;
      const len = Number.parseInt(lenTok.text, 10);
      idx++;
      if (tokens[idx]?.kind !== 'rbrack') return undefined;
      idx++;
      typeExpr = { kind: 'ArrayType', span: exprSpan, element: typeExpr, length: len };
    }
    return typeExpr;
  }

  function parseOffsetPathArg(): OffsetPathNode | undefined {
    const root = tokens[idx];
    if (!root || (root.kind !== 'ident' && root.kind !== 'lbrack')) return undefined;
    const base = root.kind === 'ident' ? root.text : undefined;
    if (base !== undefined) idx++;

    const path: OffsetPathNode = {
      kind: 'OffsetPath',
      span: exprSpan,
      ...(base !== undefined ? { base } : {}),
      steps: [],
    };

    while (true) {
      if (tokens[idx]?.kind === 'dot') {
        idx++;
        const fieldTok = tokens[idx];
        if (!fieldTok || fieldTok.kind !== 'ident') return undefined;
        idx++;
        path.steps.push({ kind: 'OffsetField', span: exprSpan, name: fieldTok.text });
        continue;
      }
      if (tokens[idx]?.kind === 'lbrack') {
        idx++;
        const inner = parseExpr(1);
        if (!inner) return undefined;
        if (tokens[idx]?.kind !== 'rbrack') return undefined;
        idx++;
        path.steps.push({ kind: 'OffsetIndex', span: exprSpan, expr: inner });
        continue;
      }
      break;
    }
    return path;
  }

  function parseExpr(minPrec: number): ImmExprNode | undefined {
    let left = parsePrimary();
    if (!left) return undefined;
    while (true) {
      const t = tokens[idx];
      if (!t || t.kind !== 'op') break;
      const prec = IMM_BINARY_OPERATOR_PRECEDENCE.get(t.text) ?? 0;
      if (prec < minPrec) break;
      if (!isImmBinaryOp(t.text)) break;
      idx++;
      const right = parseExpr(prec + 1);
      if (!right) return undefined;
      left = { kind: 'ImmBinary', span: exprSpan, op: t.text, left, right };
    }
    return left;
  }

  function parsePrimary(): ImmExprNode | undefined {
    const t = tokens[idx];
    if (!t) return undefined;
    if (t.kind === 'num') {
      idx++;
      const n = parseNumberLiteral(t.text);
      if (n === undefined) return undefined;
      return immLiteral(filePath, exprSpan, n);
    }
    if (t.kind === 'current') {
      idx++;
      return { kind: 'ImmCurrentLocation', span: { ...exprSpan, file: filePath } };
    }
    if (t.kind === 'ident') {
      if (t.text === 'sizeof' && tokens[idx + 1]?.kind === 'lparen') {
        idx += 2;
        const typeExpr = parseBuiltinTypeExprArg();
        if (!typeExpr) return undefined;
        if (tokens[idx]?.kind !== 'rparen') return undefined;
        idx++;
        return { kind: 'ImmSizeof', span: exprSpan, typeExpr };
      }
      if (t.text === 'offset' && tokens[idx + 1]?.kind === 'lparen') {
        idx += 2;
        const typeExpr = parseBuiltinTypeExprArg();
        if (!typeExpr) return undefined;
        if (tokens[idx]?.kind !== 'comma') return undefined;
        idx++;
        const path = parseOffsetPathArg();
        if (!path) return undefined;
        if (tokens[idx]?.kind !== 'rparen') return undefined;
        idx++;
        return { kind: 'ImmOffset', span: exprSpan, typeExpr, path };
      }
      const name = parseDottedIdentName();
      return name ? immName(filePath, exprSpan, name) : undefined;
    }
    if (t.kind === 'dot') {
      const next = tokens[idx + 1];
      if (!next || next.kind !== 'ident') return undefined;
      const name = next.text;
      idx += 2;
      return immName(filePath, exprSpan, `.${name}`);
    }
    if (t.kind === 'op' && isImmUnaryOp(t.text)) {
      idx++;
      const inner = parsePrimary();
      if (!inner) return undefined;
      return { kind: 'ImmUnary', span: exprSpan, op: t.text, expr: inner };
    }
    if (t.kind === 'lparen') {
      idx++;
      const inner = parseExpr(1);
      if (!inner) return undefined;
      if (tokens[idx]?.kind !== 'rparen') return undefined;
      idx++;
      return inner;
    }
    return undefined;
  }

  const root = parseExpr(1);
  if (!root || idx !== tokens.length) {
    if (emitDiagnostics) {
      diag(diagnostics, filePath, `Invalid imm expression: ${exprText}`, {
        line: exprSpan.start.line,
        column: exprSpan.start.column,
      });
    }
    return undefined;
  }
  return root;
}
