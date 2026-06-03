import type { BinaryOperator } from './constant-operator-types.js';

const binaryOperators: Readonly<
  Record<BinaryOperator, (left: number, right: number) => number | undefined>
> = {
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '*': (left, right) => left * right,
  '/': (left, right) => (right === 0 ? undefined : Math.trunc(left / right)),
  '%': (left, right) => (right === 0 ? undefined : left % right),
  '&': (left, right) => left & right,
  '^': (left, right) => left ^ right,
  '|': (left, right) => left | right,
  '<<': (left, right) => left << right,
  '>>': (left, right) => left >> right,
};

export function applyBinaryOperator(
  operator: BinaryOperator,
  left: number,
  right: number,
): number | undefined {
  return binaryOperators[operator](left, right);
}
