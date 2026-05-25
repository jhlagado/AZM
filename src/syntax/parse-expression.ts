import type {
  Expression,
  LayoutCastPathPart,
  OffsetPathPart,
  TypeExpr,
} from '../model/expression.js';

type Operator = Extract<Expression, { readonly kind: 'binary' }>['operator'];
type UnaryOperator = Extract<Expression, { readonly kind: 'unary' }>['operator'];

type Token =
  | { readonly kind: 'expression'; readonly expression: Expression }
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
  const layoutExpression = parseLayoutExpression(text);
  if (layoutExpression) {
    return layoutExpression;
  }

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

    if (token.kind === 'expression') {
      index += 1;
      return token.expression;
    }

    if (token.kind === 'symbol') {
      const next = tokenList[index + 1];
      if (token.text === 'sizeof' && next?.kind === 'left-paren') {
        index += 2;
        const typeName = tokenList[index];
        if (typeName?.kind !== 'symbol' || tokenList[index + 1]?.kind !== 'right-paren') {
          return undefined;
        }
        index += 2;
        return { kind: 'sizeof', typeExpr: { name: typeName.text } };
      }

      if (token.text === 'offset' && next?.kind === 'left-paren') {
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
        return {
          kind: 'offset',
          typeExpr: { name: typeName.text },
          path: [{ kind: 'field', name: fieldName.text }],
        };
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

export function parseTypeExpr(text: string): TypeExpr | undefined {
  const trimmed = text.trim();
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[\s*([0-9]+)\s*\])?$/.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const name = match[1] ?? '';
  const lengthText = match[2];
  if (lengthText === undefined) {
    return { name };
  }

  const length = Number.parseInt(lengthText, 10);
  return length >= 0 ? { name, length } : undefined;
}

function parseLayoutExpression(text: string): Expression | undefined {
  const trimmed = text.trim();
  const layoutCast = parseLayoutCast(trimmed);
  if (layoutCast) {
    return layoutCast;
  }

  const sizeof = /^sizeof\s*\((.*)\)$/.exec(trimmed);
  if (sizeof) {
    const typeExpr = parseTypeExpr(sizeof[1] ?? '');
    return typeExpr ? { kind: 'sizeof', typeExpr } : undefined;
  }

  const offset = /^offset\s*\((.*),(.*)\)$/.exec(trimmed);
  if (offset) {
    const typeExpr = parseTypeExpr(offset[1] ?? '');
    const path = parseOffsetPath(offset[2] ?? '');
    return typeExpr && path ? { kind: 'offset', typeExpr, path } : undefined;
  }

  return undefined;
}

function parseLayoutCast(text: string): Expression | undefined {
  if (!text.startsWith('<')) {
    return undefined;
  }

  const close = text.indexOf('>');
  if (close <= 1) {
    return undefined;
  }

  const typeExpr = parseTypeExpr(text.slice(1, close));
  if (!typeExpr) {
    return undefined;
  }

  const rest = text.slice(close + 1);
  const base = /^(?:[A-Za-z_$][A-Za-z0-9_$?]*|\?[A-Za-z0-9_$?]+)/.exec(rest);
  if (!base) {
    return undefined;
  }

  const path = parseLayoutCastPath(rest.slice(base[0].length));
  if (!path) {
    return undefined;
  }

  return {
    kind: 'layout-cast',
    typeExpr,
    base: { kind: 'symbol', name: base[0] },
    path,
  };
}

function parseLayoutCastPath(text: string): readonly LayoutCastPathPart[] | undefined {
  const parts: LayoutCastPathPart[] = [];
  let rest = text.trim();
  while (rest.length > 0) {
    if (rest.startsWith('.')) {
      const field = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
      if (!field) {
        return undefined;
      }
      parts.push({ kind: 'field', name: field[1] ?? '' });
      rest = rest.slice(field[0].length).trim();
      continue;
    }

    if (rest.startsWith('[')) {
      const close = findMatchingBracket(rest);
      if (close === undefined) {
        return undefined;
      }
      const expression = parseExpression(rest.slice(1, close));
      if (!expression) {
        return undefined;
      }
      parts.push({ kind: 'index', expression });
      rest = rest.slice(close + 1).trim();
      continue;
    }

    return undefined;
  }

  return parts.length > 0 ? parts : undefined;
}

function findMatchingBracket(text: string): number | undefined {
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return undefined;
}

function parseOffsetPath(text: string): readonly OffsetPathPart[] | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parts: OffsetPathPart[] = [];
  let rest = trimmed;
  while (rest.length > 0) {
    if (rest.startsWith('[')) {
      const index = /^\[\s*([0-9]+)\s*\]/.exec(rest);
      if (!index) {
        return undefined;
      }
      parts.push({ kind: 'index', index: Number.parseInt(index[1] ?? '', 10) });
      rest = rest.slice(index[0].length);
    } else {
      const field = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
      if (!field) {
        return undefined;
      }
      parts.push({ kind: 'field', name: field[0] });
      rest = rest.slice(field[0].length);
    }

    if (rest.length === 0) {
      break;
    }
    if (!rest.startsWith('.')) {
      return undefined;
    }
    rest = rest.slice(1);
  }

  return parts.length > 0 ? parts : undefined;
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

    if (char === "'") {
      const quoted = scanQuotedByte(input, index, char);
      if (!quoted) {
        return undefined;
      }
      tokens.push({ kind: 'number', value: quoted.value });
      index = quoted.end;
      continue;
    }

    const layoutTerm = scanSpecialTerm(input, index);
    if (layoutTerm) {
      tokens.push({ kind: 'expression', expression: layoutTerm.expression });
      index = layoutTerm.end;
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

    const symbol = /^(?:[A-Za-z_.][A-Za-z0-9_.?]*|\?[A-Za-z0-9_.?]+)/.exec(
      input.slice(index),
    );
    if (symbol) {
      tokens.push({ kind: 'symbol', text: symbol[0] });
      index += symbol[0].length;
      continue;
    }

    return undefined;
  }

  return tokens.length > 0 ? tokens : undefined;
}

function scanSpecialTerm(
  input: string,
  start: number,
): { readonly expression: Expression; readonly end: number } | undefined {
  const byteFunction = scanByteFunction(input, start);
  if (byteFunction) {
    return byteFunction;
  }

  return scanLayoutTerm(input, start);
}

function scanByteFunction(
  input: string,
  start: number,
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
  const expression = parseExpression(input.slice(open + 1, close));
  return expression
    ? { expression: { kind: 'byte-function', function: name, expression }, end: close + 1 }
    : undefined;
}

function scanLayoutTerm(
  input: string,
  start: number,
): { readonly expression: Expression; readonly end: number } | undefined {
  if (input.slice(start).startsWith('sizeof')) {
    const open = input.indexOf('(', start + 'sizeof'.length);
    if (open === -1 || input.slice(start + 'sizeof'.length, open).trim().length > 0) {
      return undefined;
    }
    const close = findMatchingParen(input, open);
    if (close === undefined) {
      return undefined;
    }
    const expression = parseLayoutExpression(input.slice(start, close + 1));
    return expression ? { expression, end: close + 1 } : undefined;
  }

  if (input.slice(start).startsWith('offset')) {
    const open = input.indexOf('(', start + 'offset'.length);
    if (open === -1 || input.slice(start + 'offset'.length, open).trim().length > 0) {
      return undefined;
    }
    const close = findMatchingParen(input, open);
    if (close === undefined) {
      return undefined;
    }
    const expression = parseLayoutExpression(input.slice(start, close + 1));
    return expression ? { expression, end: close + 1 } : undefined;
  }

  if ((input[start] ?? '') !== '<') {
    return undefined;
  }

  const end = scanLayoutCastEnd(input, start);
  if (end === undefined) {
    return undefined;
  }
  const expression = parseLayoutExpression(input.slice(start, end));
  return expression ? { expression, end } : undefined;
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
