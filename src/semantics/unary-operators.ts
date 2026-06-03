import type { UnaryOperator } from './constant-operator-types.js';

const unaryOperators: Readonly<Record<UnaryOperator, (value: number) => number>> = {
  '+': (value) => value,
  '-': (value) => -value,
  '~': (value) => ~value,
};

export function applyUnaryOperator(operator: UnaryOperator, value: number): number {
  return unaryOperators[operator](value);
}
