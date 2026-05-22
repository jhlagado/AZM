import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { SourceSpan } from '../source/source-span.js';

export interface EquateRecord {
  readonly expression: Expression;
  readonly span: SourceSpan;
  readonly currentLocation: number;
}

export function evaluateExpression(
  expression: Expression,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: {
    readonly currentLocation: number;
    readonly visiting?: ReadonlySet<string>;
    readonly reportUnknown?: boolean;
  },
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'current-location':
      return options.currentLocation;
    case 'symbol':
      return evaluateSymbol(expression.name, labels, equates, span, diagnostics, options);
    case 'unary':
      return evaluateUnary(expression, labels, equates, span, diagnostics, options);
    case 'binary':
      return evaluateBinary(expression, labels, equates, span, diagnostics, options);
  }
}

export function diagnostic(span: SourceSpan, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_SYMBOL',
    message,
    sourceName: span.sourceName,
    line: span.line,
    column: span.column,
  };
}

function evaluateSymbol(
  name: string,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: {
    readonly currentLocation: number;
    readonly visiting?: ReadonlySet<string>;
    readonly reportUnknown?: boolean;
  },
): number | undefined {
  const label = labels[name];
  if (label !== undefined) {
    return label;
  }

  const equate = equates.get(name);
  if (equate) {
    if (options.visiting?.has(name)) {
      diagnostics.push(diagnostic(span, `recursive symbol: ${name}`));
      return undefined;
    }
    return evaluateExpression(equate.expression, labels, equates, equate.span, diagnostics, {
      currentLocation: equate.currentLocation,
      visiting: new Set([...(options.visiting ?? []), name]),
    });
  }

  if (options.reportUnknown ?? true) {
    diagnostics.push(diagnostic(span, `unknown symbol: ${name}`));
  }
  return undefined;
}

function evaluateUnary(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: {
    readonly currentLocation: number;
    readonly visiting?: ReadonlySet<string>;
    readonly reportUnknown?: boolean;
  },
): number | undefined {
  const value = evaluateExpression(
    expression.expression,
    labels,
    equates,
    span,
    diagnostics,
    options,
  );
  if (value === undefined) {
    return undefined;
  }
  switch (expression.operator) {
    case '+':
      return value;
    case '-':
      return -value;
    case '~':
      return ~value;
  }
}

function evaluateBinary(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: {
    readonly currentLocation: number;
    readonly visiting?: ReadonlySet<string>;
    readonly reportUnknown?: boolean;
  },
): number | undefined {
  const left = evaluateExpression(expression.left, labels, equates, span, diagnostics, options);
  const right = evaluateExpression(expression.right, labels, equates, span, diagnostics, options);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  switch (expression.operator) {
    case '*':
      return left * right;
    case '/':
      if (right === 0) {
        diagnostics.push(diagnostic(span, 'divide by zero in expression'));
        return undefined;
      }
      return Math.trunc(left / right);
    case '%':
      if (right === 0) {
        diagnostics.push(diagnostic(span, 'modulo by zero in expression'));
        return undefined;
      }
      return left % right;
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '&':
      return left & right;
    case '^':
      return left ^ right;
    case '|':
      return left | right;
    case '<<':
      return left << right;
    case '>>':
      return left >> right;
  }
}
