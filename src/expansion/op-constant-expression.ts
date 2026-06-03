import type { Expression } from '../model/expression.js';

const BINARY_CONSTANT_OPERATORS = new Map<
  Extract<Expression, { readonly kind: 'binary' }>['operator'],
  (left: number, right: number) => number | undefined
>([
  ['+', (left, right) => left + right],
  ['-', (left, right) => left - right],
  ['*', (left, right) => left * right],
  ['/', (left, right) => (right === 0 ? undefined : Math.trunc(left / right))],
  ['%', (left, right) => (right === 0 ? undefined : left % right)],
  ['&', (left, right) => left & right],
  ['^', (left, right) => left ^ right],
  ['|', (left, right) => left | right],
  ['<<', (left, right) => left << right],
  ['>>', (left, right) => left >> right],
]);

export function expressionFitsKnownImm8(expression: Expression): boolean {
  const value = expressionConstantValue(expression);
  return value === undefined || (value >= -0x80 && value <= 0xff);
}

export function expressionFitsKnownImm16(expression: Expression): boolean {
  const value = expressionConstantValue(expression);
  return value === undefined || (value >= -0x8000 && value <= 0xffff);
}

function expressionConstantValue(expression: Expression): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'unary':
      return unaryConstantValue(expression);
    case 'binary':
      return binaryConstantValue(expression);
    default:
      return undefined;
  }
}

function unaryConstantValue(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
): number | undefined {
  const value = expressionConstantValue(expression.expression);
  if (value === undefined) return undefined;
  switch (expression.operator) {
    case '+':
      return value;
    case '-':
      return -value;
    case '~':
      return ~value;
  }
}

function binaryConstantValue(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
): number | undefined {
  const left = expressionConstantValue(expression.left);
  const right = expressionConstantValue(expression.right);
  if (left === undefined || right === undefined) return undefined;
  return BINARY_CONSTANT_OPERATORS.get(expression.operator)?.(left, right);
}
