import type { Expression } from '../model/expression.js';
import {
  findMatchingBracket,
  parseLayoutExpression,
  type ParseNestedExpression,
} from './parse-layout-expression.js';

export type Operator = Extract<Expression, { readonly kind: 'binary' }>['operator'];
export type UnaryOperator = Extract<Expression, { readonly kind: 'unary' }>['operator'];

export type Token =
  | { readonly kind: 'expression'; readonly expression: Expression }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'symbol'; readonly text: string }
  | { readonly kind: 'current-location' }
  | { readonly kind: 'operator'; readonly text: Operator | UnaryOperator }
  | { readonly kind: 'comma' }
  | { readonly kind: 'left-paren' }
  | { readonly kind: 'right-paren' };

type TokenScanResult = { readonly token: Token; readonly end: number };
type TokenScanner = (
  input: string,
  index: number,
  parseNestedExpression: ParseNestedExpression,
) => TokenScanResult | undefined;

const TOKEN_SCANNERS: readonly TokenScanner[] = [
  scanPunctuationToken,
  scanShiftOperatorToken,
  scanCurrentLocationOrHexToken,
  scanQuotedByteToken,
  scanSpecialTermToken,
  scanNumberToken,
  scanOperatorToken,
  scanSymbolToken,
];

export function tokenizeExpression(
  text: string,
  parseNestedExpression: ParseNestedExpression,
): Token[] | undefined {
  const tokens: Token[] = [];
  const input = text.trim();
  let index = 0;

  while (index < input.length) {
    const char = input[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const scanned = scanToken(input, index, parseNestedExpression);
    if (!scanned) return undefined;
    tokens.push(scanned.token);
    index = scanned.end;
  }

  return tokens.length > 0 ? tokens : undefined;
}

function scanToken(
  input: string,
  index: number,
  parseNestedExpression: ParseNestedExpression,
): TokenScanResult | undefined {
  for (const scanner of TOKEN_SCANNERS) {
    const scanned = scanner(input, index, parseNestedExpression);
    if (scanned) return scanned;
  }
  return undefined;
}

function scanPunctuationToken(input: string, index: number): TokenScanResult | undefined {
  const char = input[index];
  if (char === '(') return { token: { kind: 'left-paren' }, end: index + 1 };
  if (char === ')') return { token: { kind: 'right-paren' }, end: index + 1 };
  if (char === ',') return { token: { kind: 'comma' }, end: index + 1 };
  return undefined;
}

function scanShiftOperatorToken(input: string, index: number): TokenScanResult | undefined {
  const two = input.slice(index, index + 2);
  return two === '<<' || two === '>>'
    ? { token: { kind: 'operator', text: two }, end: index + 2 }
    : undefined;
}

function scanCurrentLocationOrHexToken(input: string, index: number): TokenScanResult | undefined {
  if (input[index] !== '$') return undefined;
  const prefixedHex = /^\$[0-9A-Fa-f]+/.exec(input.slice(index));
  if (prefixedHex) {
    return {
      token: { kind: 'number', value: Number.parseInt(prefixedHex[0].slice(1), 16) },
      end: index + prefixedHex[0].length,
    };
  }
  if (/^[A-Za-z_]/.test(input[index + 1] ?? '')) {
    return undefined;
  }
  return { token: { kind: 'current-location' }, end: index + 1 };
}

function scanQuotedByteToken(input: string, index: number): TokenScanResult | undefined {
  const quote = input[index];
  if (quote !== '"' && quote !== "'") return undefined;
  const quoted = scanQuotedByte(input, index, quote);
  return quoted ? { token: { kind: 'number', value: quoted.value }, end: quoted.end } : undefined;
}

function scanSpecialTermToken(
  input: string,
  index: number,
  parseNestedExpression: ParseNestedExpression,
): TokenScanResult | undefined {
  const term = scanSpecialTerm(input, index, parseNestedExpression);
  return term ? { token: { kind: 'expression', expression: term.expression }, end: term.end } : undefined;
}

function scanNumberToken(input: string, index: number): TokenScanResult | undefined {
  const number = scanNumber(input.slice(index));
  return number
    ? { token: { kind: 'number', value: number.value }, end: index + number.length }
    : undefined;
}

function scanOperatorToken(input: string, index: number): TokenScanResult | undefined {
  const char = input[index] ?? '';
  return isOperatorChar(char) ? { token: { kind: 'operator', text: char }, end: index + 1 } : undefined;
}

function scanSymbolToken(input: string, index: number): TokenScanResult | undefined {
  const symbol = /^(?:[A-Za-z_.][A-Za-z0-9_.?]*|\?[A-Za-z0-9_.?]+)/.exec(input.slice(index));
  return symbol ? { token: { kind: 'symbol', text: symbol[0] }, end: index + symbol[0].length } : undefined;
}

function isOperatorChar(char: string): char is Operator | UnaryOperator {
  return ['*', '/', '%', '+', '-', '&', '^', '|', '~'].includes(char);
}

function scanSpecialTerm(
  input: string,
  start: number,
  parseNestedExpression: ParseNestedExpression,
): { readonly expression: Expression; readonly end: number } | undefined {
  const byteFunction = scanByteFunction(input, start, parseNestedExpression);
  if (byteFunction) {
    return byteFunction;
  }

  return scanLayoutTerm(input, start, parseNestedExpression);
}

function scanByteFunction(
  input: string,
  start: number,
  parseNestedExpression: ParseNestedExpression,
): { readonly expression: Expression; readonly end: number } | undefined {
  const head = /^(LSB|MSB)\s*\(/.exec(input.slice(start));
  if (!head) {
    return undefined;
  }
  const name = head[1] as 'LSB' | 'MSB';
  const open = input.indexOf('(', start + name.length);
  if (open === -1 || input.slice(start + name.length, open).trim().length > 0) {
    return undefined;
  }
  const close = findMatchingParen(input, open);
  if (close === undefined) {
    return undefined;
  }
  const expression = parseNestedExpression(input.slice(open + 1, close));
  return expression
    ? { expression: { kind: 'byte-function', function: name, expression }, end: close + 1 }
    : undefined;
}

function scanLayoutTerm(
  input: string,
  start: number,
  parseNestedExpression: ParseNestedExpression,
): { readonly expression: Expression; readonly end: number } | undefined {
  const layoutCall = scanLayoutCallTerm(input, start, parseNestedExpression);
  if (layoutCall) return layoutCall;

  if ((input[start] ?? '') !== '<') {
    return undefined;
  }

  const end = scanLayoutCastEnd(input, start);
  if (end === undefined) {
    return undefined;
  }
  const expression = parseLayoutExpression(input.slice(start, end), parseNestedExpression);
  return expression ? { expression, end } : undefined;
}

function scanLayoutCallTerm(
  input: string,
  start: number,
  parseNestedExpression: ParseNestedExpression,
): { readonly expression: Expression; readonly end: number } | undefined {
  const head = scanLayoutCallHead(input, start);
  if (!head) return undefined;

  const close = findMatchingParen(input, head.open);
  if (close === undefined) return undefined;

  const expression = parseLayoutExpression(input.slice(start, close + 1), parseNestedExpression);
  return expression ? { expression, end: close + 1 } : undefined;
}

function scanLayoutCallHead(
  input: string,
  start: number,
): { readonly open: number } | undefined {
  const name = layoutCallNameAt(input, start);
  if (!name) return undefined;

  const open = input.indexOf('(', start + name.length);
  return open !== -1 && input.slice(start + name.length, open).trim().length === 0
    ? { open }
    : undefined;
}

function layoutCallNameAt(input: string, start: number): 'sizeof' | 'offset' | undefined {
  if (input.slice(start).startsWith('sizeof')) return 'sizeof';
  if (input.slice(start).startsWith('offset')) return 'offset';
  return undefined;
}

function findMatchingParen(text: string, open: number): number | undefined {
  let depth = 0;
  let quote: string | undefined;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return undefined;
}

function scanLayoutCastEnd(input: string, start: number): number | undefined {
  const closeType = input.indexOf('>', start + 1);
  if (closeType === -1) {
    return undefined;
  }
  let index = closeType + 1;
  const base = /^(?:[A-Za-z_$][A-Za-z0-9_$?]*|\?[A-Za-z0-9_$?]+)/.exec(
    input.slice(index),
  );
  if (!base) {
    return undefined;
  }
  index += base[0].length;

  let sawPath = false;
  while (index < input.length) {
    const char = input[index];
    if (char === '.') {
      const field = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(input.slice(index));
      if (!field) {
        return undefined;
      }
      sawPath = true;
      index += field[0].length;
      continue;
    }
    if (char === '[') {
      const close = findMatchingBracket(input.slice(index));
      if (close === undefined) {
        return undefined;
      }
      sawPath = true;
      index += close + 1;
      continue;
    }
    break;
  }

  return sawPath ? index : undefined;
}

function scanNumber(text: string): { readonly value: number; readonly length: number } | undefined {
  const trailingHex = /^[0-9][0-9A-Fa-f]*[Hh]\b/.exec(text);
  if (trailingHex) {
    return {
      value: Number.parseInt(trailingHex[0].slice(0, -1), 16),
      length: trailingHex[0].length,
    };
  }

  const trailingBinary = /^[01]+[Bb]\b/.exec(text);
  if (trailingBinary) {
    return {
      value: Number.parseInt(trailingBinary[0].slice(0, -1), 2),
      length: trailingBinary[0].length,
    };
  }

  const percentBinary = /^%[01]+/.exec(text);
  if (percentBinary) {
    return {
      value: Number.parseInt(percentBinary[0].slice(1), 2),
      length: percentBinary[0].length,
    };
  }

  const prefixedBinary = /^0b[01]+/i.exec(text);
  if (prefixedBinary) {
    return {
      value: Number.parseInt(prefixedBinary[0].slice(2), 2),
      length: prefixedBinary[0].length,
    };
  }

  const prefixedHex = /^0x[0-9A-Fa-f]+/i.exec(text);
  if (prefixedHex) {
    return { value: Number.parseInt(prefixedHex[0].slice(2), 16), length: prefixedHex[0].length };
  }

  const decimal = /^[0-9]+/.exec(text);
  if (decimal) {
    return { value: Number.parseInt(decimal[0], 10), length: decimal[0].length };
  }

  return undefined;
}

function scanQuotedByte(
  text: string,
  start: number,
  quote: string,
): { readonly value: number; readonly end: number } | undefined {
  const valueIndex = start + 1;
  const value = text[valueIndex];
  if (!isQuotedByteValueStart(value, quote)) return undefined;

  const scanned =
    value === '\\' ? scanEscapedQuotedByte(text, valueIndex) : scanLiteralQuotedByte(value, valueIndex);
  if (!scanned) return undefined;

  return text[scanned.end] === quote
    ? { value: scanned.value, end: scanned.end + 1 }
    : undefined;
}

function isQuotedByteValueStart(value: string | undefined, quote: string): value is string {
  return value !== undefined && value !== quote && value !== '\n' && value !== '\r';
}

function scanEscapedQuotedByte(
  text: string,
  valueIndex: number,
): { readonly value: number; readonly end: number } | undefined {
  const escaped = text[valueIndex + 1];
  if (escaped === undefined) return undefined;

  const value = escapeByteValue(escaped);
  return value === undefined ? undefined : { value, end: valueIndex + 2 };
}

function scanLiteralQuotedByte(
  value: string,
  valueIndex: number,
): { readonly value: number; readonly end: number } {
  const byte = value.codePointAt(0) ?? 0;
  return { value: byte, end: valueIndex + (byte > 0xffff ? 2 : 1) };
}

function escapeByteValue(char: string): number | undefined {
  switch (char) {
    case '0':
      return 0;
    case 'n':
      return 10;
    case 'r':
      return 13;
    case 't':
      return 9;
    case "'":
      return 39;
    case '"':
      return 34;
    case '\\':
      return 92;
    default:
      return undefined;
  }
}
