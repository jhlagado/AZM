import type { Expression } from '../model/expression.js';

type Operator = Extract<Expression, { readonly kind: 'binary' }>['operator'];
type UnaryOperator = Extract<Expression, { readonly kind: 'unary' }>['operator'];

type Token =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'symbol'; readonly text: string }
  | { readonly kind: 'current-location' }
  | { readonly kind: 'operator'; readonly text: Operator | UnaryOperator }
  | { readonly kind: 'comma' }
  | { readonly kind: 'left-paren' }
  | { readonly kind: 'right-paren' };

const PRECEDENCE = new Map<Operator, number>([
  ['|', 1],
  ['^', 2],
  ['&', 3],
  ['<<', 4],
  ['>>', 4],
  ['+', 5],
  ['-', 5],
  ['*', 6],
  ['/', 6],
  ['%', 6],
]);

export function parseExpression(text: string): Expression | undefined {
  const tokens = tokenizeExpression(text);
  if (!tokens) {
    return undefined;
  }

  const tokenList = tokens;
  let index = 0;

  function parsePrimary(): Expression | undefined {
    const token = tokenList[index];
    if (!token) {
      return undefined;
    }

    if (token.kind === 'number') {
      index += 1;
      return { kind: 'number', value: token.value };
    }

    if (token.kind === 'symbol') {
      const next = tokenList[index + 1];
      if (token.text.toLowerCase() === 'sizeof' && next?.kind === 'left-paren') {
        index += 2;
        const typeName = tokenList[index];
        if (typeName?.kind !== 'symbol' || tokenList[index + 1]?.kind !== 'right-paren') {
          return undefined;
        }
        index += 2;
        return { kind: 'sizeof', typeName: typeName.text };
      }

      if (token.text.toLowerCase() === 'offset' && next?.kind === 'left-paren') {
        index += 2;
        const typeName = tokenList[index];
        const comma = tokenList[index + 1];
        const fieldName = tokenList[index + 2];
        const rightParen = tokenList[index + 3];
        if (
          typeName?.kind !== 'symbol' ||
          comma?.kind !== 'comma' ||
          fieldName?.kind !== 'symbol' ||
          rightParen?.kind !== 'right-paren'
        ) {
          return undefined;
        }
        index += 4;
        return { kind: 'offset', typeName: typeName.text, fieldName: fieldName.text };
      }

      index += 1;
      return { kind: 'symbol', name: token.text };
    }

    if (token.kind === 'current-location') {
      index += 1;
      return { kind: 'current-location' };
    }

    if (token.kind === 'operator' && isUnaryOperator(token.text)) {
      index += 1;
      const expression = parsePrimary();
      return expression ? { kind: 'unary', operator: token.text, expression } : undefined;
    }

    if (token.kind === 'left-paren') {
      index += 1;
      const expression = parseBinary(1);
      if (!expression || tokenList[index]?.kind !== 'right-paren') {
        return undefined;
      }
      index += 1;
      return expression;
    }

    return undefined;
  }

  function parseBinary(minPrecedence: number): Expression | undefined {
    let left = parsePrimary();
    if (!left) {
      return undefined;
    }

    while (true) {
      const token = tokenList[index];
      if (!token || token.kind !== 'operator' || !isBinaryOperator(token.text)) {
        break;
      }

      const precedence = PRECEDENCE.get(token.text) ?? 0;
      if (precedence < minPrecedence) {
        break;
      }

      index += 1;
      const right = parseBinary(precedence + 1);
      if (!right) {
        return undefined;
      }
      left = { kind: 'binary', operator: token.text, left, right };
    }

    return left;
  }

  const expression = parseBinary(1);
  return expression && index === tokenList.length ? expression : undefined;
}

function tokenizeExpression(text: string): Token[] | undefined {
  const tokens: Token[] = [];
  const input = text.trim();
  let index = 0;

  while (index < input.length) {
    const char = input[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'left-paren' });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ kind: 'right-paren' });
      index += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ kind: 'comma' });
      index += 1;
      continue;
    }

    const two = input.slice(index, index + 2);
    if (two === '<<' || two === '>>') {
      tokens.push({ kind: 'operator', text: two });
      index += 2;
      continue;
    }

    if (char === '$') {
      const prefixedHex = /^\$[0-9A-Fa-f]+/.exec(input.slice(index));
      if (prefixedHex) {
        tokens.push({ kind: 'number', value: Number.parseInt(prefixedHex[0].slice(1), 16) });
        index += prefixedHex[0].length;
        continue;
      }
      if (/^[A-Za-z_]/.test(input[index + 1] ?? '')) {
        return undefined;
      }
      tokens.push({ kind: 'current-location' });
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const quoted = scanQuotedByte(input, index, char);
      if (!quoted) {
        return undefined;
      }
      tokens.push({ kind: 'number', value: quoted.value });
      index = quoted.end;
      continue;
    }

    const number = scanNumber(input.slice(index));
    if (number) {
      tokens.push({ kind: 'number', value: number.value });
      index += number.length;
      continue;
    }

    if (isOperatorChar(char)) {
      tokens.push({ kind: 'operator', text: char });
      index += 1;
      continue;
    }

    const symbol = /^[A-Za-z_.?][A-Za-z0-9_.?]*/.exec(input.slice(index));
    if (symbol) {
      tokens.push({ kind: 'symbol', text: symbol[0] });
      index += symbol[0].length;
      continue;
    }

    return undefined;
  }

  return tokens.length > 0 ? tokens : undefined;
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
  if (value === undefined || value === quote || value === '\n' || value === '\r') {
    return undefined;
  }

  let byte: number;
  let end: number;
  if (value === '\\') {
    const escaped = text[valueIndex + 1];
    if (escaped === undefined) {
      return undefined;
    }
    const escapeValue = escapeByteValue(escaped);
    if (escapeValue === undefined) {
      return undefined;
    }
    byte = escapeValue;
    end = valueIndex + 2;
  } else {
    byte = value.codePointAt(0) ?? 0;
    end = valueIndex + (byte > 0xffff ? 2 : 1);
  }

  if (text[end] !== quote) {
    return undefined;
  }
  return { value: byte, end: end + 1 };
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

function isOperatorChar(char: string): char is Operator | UnaryOperator {
  return ['*', '/', '%', '+', '-', '&', '^', '|', '~'].includes(char);
}

function isUnaryOperator(operator: Operator | UnaryOperator): operator is UnaryOperator {
  return operator === '+' || operator === '-' || operator === '~';
}

function isBinaryOperator(operator: Operator | UnaryOperator): operator is Operator {
  return PRECEDENCE.has(operator as Operator);
}
