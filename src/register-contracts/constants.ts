import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import {
  applyBinaryOperator,
  applyByteFunction,
  applyUnaryOperator,
} from '../semantics/constant-operators.js';

export function evaluateKnownConstant(
  expression: Expression,
  constants: ReadonlyMap<string, number>,
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'symbol':
      return constants.get(expression.name);
    case 'unary':
      return evaluateUnaryConstant(expression, constants);
    case 'binary':
      return evaluateBinaryConstant(expression, constants);
    case 'byte-function': {
      const value = evaluateKnownConstant(expression.expression, constants);
      if (value === undefined) return undefined;
      return applyByteFunction(expression.function, value);
    }
    default:
      return undefined;
  }
}

export function collectConstants(items: readonly SourceItem[]): ReadonlyMap<string, number> {
  const constants = new Map<string, number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.kind !== 'equ' || constants.has(item.name)) continue;
      const value = evaluateKnownConstant(item.expression, constants);
      if (value === undefined) continue;
      constants.set(item.name, value);
      changed = true;
    }
  }
  return constants;
}

function evaluateUnaryConstant(
  expression: Extract<Expression, { kind: 'unary' }>,
  constants: ReadonlyMap<string, number>,
): number | undefined {
  const value = evaluateKnownConstant(expression.expression, constants);
  if (value === undefined) return undefined;
  return applyUnaryOperator(expression.operator, value);
}

function evaluateBinaryConstant(
  expression: Extract<Expression, { kind: 'binary' }>,
  constants: ReadonlyMap<string, number>,
): number | undefined {
  const left = evaluateKnownConstant(expression.left, constants);
  const right = evaluateKnownConstant(expression.right, constants);
  if (left === undefined || right === undefined) return undefined;
  return applyBinaryOperator(expression.operator, left, right);
}
