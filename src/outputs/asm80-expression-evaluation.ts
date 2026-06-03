import type { Expression } from '../model/expression.js';
import {
  evaluateExpression,
  type LayoutRecord,
} from '../semantics/expression-evaluation.js';
import {
  applyBinaryOperator,
  applyByteFunction,
  applyUnaryOperator,
} from '../semantics/constant-operators.js';

const silentSpan = { sourceName: '', line: 0, column: 0 };

export type ConstantMap = ReadonlyMap<string, number>;
export type LayoutMap = ReadonlyMap<string, LayoutRecord>;
export type LoweredEvalContext = {
  readonly constants: ConstantMap;
  readonly symbols: ConstantMap;
  readonly layouts: LayoutMap;
};

export function evaluateLoweredConstant(
  expression: Expression,
  evalContext: LoweredEvalContext,
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'symbol':
      return evalContext.constants.get(expression.name);
    case 'type-size':
      return evaluateLoweredTypeSize(expression, evalContext);
    case 'offset':
    case 'sizeof':
      return evaluateLayoutExpression(expression, evalContext);
    case 'byte-function':
      return evaluateLoweredByteFunction(expression, evalContext);
    case 'unary':
      return evaluateLoweredUnary(expression, evalContext);
    case 'binary':
      return evaluateLoweredBinary(expression, evalContext);
    default:
      return undefined;
  }
}

function evaluateLoweredTypeSize(
  expression: Extract<Expression, { readonly kind: 'type-size' }>,
  evalContext: LoweredEvalContext,
): number | undefined {
  const constant = evalContext.constants.get(expression.typeExpr.name);
  return constant ?? evaluateLayoutExpression(expression, evalContext);
}

function evaluateLayoutExpression(
  expression: Expression,
  evalContext: LoweredEvalContext,
): number | undefined {
  return evaluateExpression(expression, {}, new Map(), silentSpan, [], {
    currentLocation: 0,
    layouts: evalContext.layouts,
    reportUnknown: false,
  });
}

function evaluateLoweredByteFunction(
  expression: Extract<Expression, { readonly kind: 'byte-function' }>,
  evalContext: LoweredEvalContext,
): number | undefined {
  const value = evaluateLoweredResolvedConstant(expression.expression, evalContext);
  return value === undefined ? undefined : applyByteFunction(expression.function, value);
}

function evaluateLoweredUnary(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
  evalContext: LoweredEvalContext,
): number | undefined {
  const value = evaluateLoweredConstant(expression.expression, evalContext);
  return value === undefined ? undefined : applyUnaryOperator(expression.operator, value);
}

function evaluateLoweredBinary(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
  evalContext: LoweredEvalContext,
): number | undefined {
  const left = evaluateLoweredConstant(expression.left, evalContext);
  const right = evaluateLoweredConstant(expression.right, evalContext);
  return left === undefined || right === undefined
    ? undefined
    : applyBinaryOperator(expression.operator, left, right);
}

function evaluateLoweredResolvedConstant(
  expression: Expression,
  evalContext: LoweredEvalContext,
): number | undefined {
  switch (expression.kind) {
    case 'symbol':
      return evalContext.symbols.get(expression.name) ?? evalContext.constants.get(expression.name);
    case 'unary':
      return evaluateResolvedUnary(expression, evalContext);
    case 'binary':
      return evaluateResolvedBinary(expression, evalContext);
    case 'byte-function':
      return evaluateLoweredByteFunction(expression, evalContext);
    default:
      return evaluateLoweredConstant(expression, evalContext);
  }
}

function evaluateResolvedUnary(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
  evalContext: LoweredEvalContext,
): number | undefined {
  const value = evaluateLoweredResolvedConstant(expression.expression, evalContext);
  return value === undefined ? undefined : applyUnaryOperator(expression.operator, value);
}

function evaluateResolvedBinary(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
  evalContext: LoweredEvalContext,
): number | undefined {
  const left = evaluateLoweredResolvedConstant(expression.left, evalContext);
  const right = evaluateLoweredResolvedConstant(expression.right, evalContext);
  return left === undefined || right === undefined
    ? undefined
    : applyBinaryOperator(expression.operator, left, right);
}
