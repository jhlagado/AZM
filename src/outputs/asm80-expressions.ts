import type { Expression } from '../model/expression.js';
import { evaluateLoweredConstant, type LoweredEvalContext } from './asm80-expression-evaluation.js';
export {
  evaluateLoweredConstant,
  type ConstantMap,
  type LayoutMap,
  type LoweredEvalContext,
} from './asm80-expression-evaluation.js';

type UnaryOperator = Extract<Expression, { readonly kind: 'unary' }>['operator'];

const formatUnaryExpression: Readonly<Record<UnaryOperator, (inner: string) => string | undefined>> =
  {
    '+': (inner) => inner,
    '-': (inner) => `-${inner}`,
    '~': () => undefined,
  };

export function formatExpression(
  expression: Expression,
  evalContext: LoweredEvalContext,
  width: 'byte' | 'word' | 'auto',
): string | undefined {
  const value = evaluateLoweredConstant(expression, evalContext);
  if (value !== undefined) {
    return formatLoweredNumber(value, width);
  }

  return formatUnevaluatedExpression(expression, evalContext, width);
}

export function formatLoweredNumber(value: number, width: 'byte' | 'word' | 'auto'): string {
  const normalized = value < 0 ? value & 0xffff : value;
  const digits = normalized.toString(16).toUpperCase();
  const minWidth = width === 'word' || (width === 'auto' && normalized > 0xff) ? 4 : 2;
  return `$${digits.padStart(minWidth, '0')}`;
}

function formatUnevaluatedExpression(
  expression: Expression,
  evalContext: LoweredEvalContext,
  width: 'byte' | 'word' | 'auto',
): string | undefined {
  switch (expression.kind) {
    case 'symbol':
      return expression.name;
    case 'type-size':
      return expression.typeExpr.name;
    case 'current-location':
      return '$';
    case 'unary':
      return formatUnary(expression, evalContext, width);
    case 'binary':
      return formatBinary(expression, evalContext, width);
    default:
      return undefined;
  }
}

function formatUnary(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
  evalContext: LoweredEvalContext,
  width: 'byte' | 'word' | 'auto',
): string | undefined {
  const inner = formatExpression(expression.expression, evalContext, width);
  return inner === undefined ? undefined : formatUnaryExpression[expression.operator](inner);
}

function formatBinary(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
  evalContext: LoweredEvalContext,
  width: 'byte' | 'word' | 'auto',
): string | undefined {
  const left = formatExpression(expression.left, evalContext, width);
  const right = formatExpression(expression.right, evalContext, width);
  return left === undefined || right === undefined
    ? undefined
    : `${left}${expression.operator}${right}`;
}
