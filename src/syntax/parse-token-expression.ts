import type { Expression } from '../model/expression.js';
import type { Operator, Token, UnaryOperator } from './expression-tokenizer.js';

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

export function parseTokenExpression(tokenList: readonly Token[]): Expression | undefined {
  let index = 0;

  function consume(): Token {
    const token = tokenList[index];
    if (!token) {
      throw new Error('parseExpression consumed past end of token list');
    }
    index += 1;
    return token;
  }

  function parsePrimary(): Expression | undefined {
    const token = tokenList[index];
    if (!token) return undefined;
    if (token.kind === 'number') return parseNumberToken(consume());
    if (token.kind === 'expression') return parseNestedExpressionToken(consume());
    if (token.kind === 'symbol') return parseSymbolPrimary();
    if (token.kind === 'current-location') return parseCurrentLocationPrimary();
    if (token.kind === 'operator' && isUnaryOperator(token.text)) {
      return parseUnaryPrimary(token.text);
    }
    if (token.kind === 'left-paren') return parseParenthesizedPrimary();
    return undefined;
  }

  function parseNumberToken(token: Token): Expression | undefined {
    return token.kind === 'number' ? { kind: 'number', value: token.value } : undefined;
  }

  function parseNestedExpressionToken(token: Token): Expression | undefined {
    return token.kind === 'expression' ? token.expression : undefined;
  }

  function parseCurrentLocationPrimary(): Expression {
    consume();
    return { kind: 'current-location' };
  }

  function parseSymbolPrimary(): Expression | undefined {
    const token = tokenList[index];
    if (token?.kind !== 'symbol') return undefined;
    if (token.text === 'sizeof' && tokenList[index + 1]?.kind === 'left-paren') {
      return parseSizeofPrimary();
    }
    if (token.text === 'offset' && tokenList[index + 1]?.kind === 'left-paren') {
      return parseOffsetPrimary();
    }

    index += 1;
    return { kind: 'symbol', name: token.text };
  }

  function parseSizeofPrimary(): Expression | undefined {
    index += 2;
    const typeName = tokenList[index];
    if (typeName?.kind !== 'symbol' || tokenList[index + 1]?.kind !== 'right-paren') {
      return undefined;
    }
    index += 2;
    return { kind: 'sizeof', typeExpr: { name: typeName.text } };
  }

  function parseOffsetPrimary(): Expression | undefined {
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

  function parseUnaryPrimary(operator: UnaryOperator): Expression | undefined {
    index += 1;
    const expression = parsePrimary();
    return expression ? { kind: 'unary', operator, expression } : undefined;
  }

  function parseParenthesizedPrimary(): Expression | undefined {
    index += 1;
    const expression = parseBinary(1);
    if (!expression || tokenList[index]?.kind !== 'right-paren') return undefined;
    index += 1;
    return expression;
  }

  function parseBinary(minPrecedence: number): Expression | undefined {
    let left = parsePrimary();
    if (!left) return undefined;

    while (true) {
      const token = tokenList[index];
      if (!token || token.kind !== 'operator' || !isBinaryOperator(token.text)) break;

      const precedence = PRECEDENCE.get(token.text) ?? 0;
      if (precedence < minPrecedence) break;

      index += 1;
      const right = parseBinary(precedence + 1);
      if (!right) return undefined;
      left = { kind: 'binary', operator: token.text, left, right };
    }

    return left;
  }

  const expression = parseBinary(1);
  return expression && index === tokenList.length ? expression : undefined;
}

function isUnaryOperator(operator: Operator | UnaryOperator): operator is UnaryOperator {
  return operator === '+' || operator === '-' || operator === '~';
}

function isBinaryOperator(operator: Operator | UnaryOperator): operator is Operator {
  return PRECEDENCE.has(operator as Operator);
}
