import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression, TypeExpr } from '../model/expression.js';
import type { SourceSpan } from '../source/source-span.js';
import {
  applyBinaryOperator,
  applyByteFunction,
  applyUnaryOperator,
} from './constant-operators.js';
import { diagnostic } from './diagnostics.js';
import {
  evaluateLayoutCast,
  evaluateOffset,
  evaluateSizeof,
  typeExprSize,
  type LayoutRecord,
} from './layout-evaluation.js';
import { formatTypeExpr, scalarSize } from './layout-format.js';

export { diagnostic } from './diagnostics.js';
export { validateLayouts, type LayoutRecord } from './layout-evaluation.js';

export interface EquateRecord {
  readonly expression: Expression;
  readonly span: SourceSpan;
  readonly currentLocation: number;
  readonly enumMember?: boolean;
  readonly stringValue?: string;
}

export interface EvaluateExpressionOptions {
  readonly currentLocation: number;
  readonly layouts?: ReadonlyMap<string, LayoutRecord> | undefined;
  readonly visiting?: ReadonlySet<string>;
  readonly reportUnknown?: boolean;
}

function canonicalSymbolKey(name: string): string {
  return name.toLowerCase();
}

function lookupLabelValue(
  labels: Readonly<Record<string, number>>,
  name: string,
): number | undefined {
  if (labels[name] !== undefined) {
    return labels[name];
  }
  const lower = canonicalSymbolKey(name);
  for (const [key, value] of Object.entries(labels)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}

export function lookupEquateRecord(
  equates: ReadonlyMap<string, EquateRecord>,
  name: string,
): { readonly key: string; readonly record: EquateRecord } | undefined {
  const direct = equates.get(name);
  if (direct !== undefined) {
    return { key: name, record: direct };
  }
  const lower = canonicalSymbolKey(name);
  for (const [key, record] of equates) {
    if (key.toLowerCase() === lower) {
      return { key, record };
    }
  }
  return undefined;
}

export function lookupSymbolValue(
  symbols: Readonly<Record<string, number>>,
  name: string,
): number | undefined {
  return lookupLabelValue(symbols, name);
}

export function evaluateExpression(
  expression: Expression,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'current-location':
      return options.currentLocation;
    case 'type-size':
      return evaluateTypeSize(expression.typeExpr, labels, equates, span, diagnostics, options);
    case 'sizeof':
      return evaluateSizeof(expression.typeExpr, options.layouts, span, diagnostics);
    case 'byte-function':
      return evaluateByteFunction(expression, labels, equates, span, diagnostics, options);
    case 'offset':
      return evaluateOffset(
        expression.typeExpr,
        expression.path,
        options.layouts,
        span,
        diagnostics,
      );
    case 'layout-cast':
      return evaluateLayoutCast(expression, labels, equates, span, diagnostics, options, evaluateExpression);
    case 'symbol':
      return evaluateSymbol(expression.name, labels, equates, span, diagnostics, options);
    case 'unary':
      return evaluateUnary(expression, labels, equates, span, diagnostics, options);
    case 'binary':
      return evaluateBinary(expression, labels, equates, span, diagnostics, options);
  }
}

function evaluateByteFunction(
  expression: Extract<Expression, { readonly kind: 'byte-function' }>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
): number | undefined {
  const value = evaluateExpression(expression.expression, labels, equates, span, diagnostics, options);
  if (value === undefined) {
    return undefined;
  }
  return applyByteFunction(expression.function, value);
}

function evaluateTypeSize(
  typeExpr: TypeExpr,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
): number | undefined {
  if (options.layouts) {
    const sizeDiagnostics: Diagnostic[] = [];
    const size = typeExprSize(
      typeExpr,
      options.layouts,
      span,
      sizeDiagnostics,
      new Set([typeExpr.name]),
    );
    if (size !== undefined) {
      return size;
    }
    if (typeExpr.length !== undefined || scalarSize(typeExpr.name) !== undefined) {
      diagnostics.push(...sizeDiagnostics);
      return undefined;
    }
  }

  if (typeExpr.length !== undefined) {
    diagnostics.push(diagnostic(span, `unknown type: ${formatTypeExpr(typeExpr)}`));
    return undefined;
  }
  return evaluateSymbol(typeExpr.name, labels, equates, span, diagnostics, options);
}

function evaluateSymbol(
  name: string,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
): number | undefined {
  const label = lookupLabelValue(labels, name);
  if (label !== undefined) {
    return label;
  }

  const equate = lookupEquateRecord(equates, name);
  if (equate) {
    if (options.visiting?.has(equate.key)) {
      diagnostics.push(diagnostic(span, `recursive symbol: ${name}`));
      return undefined;
    }
    return evaluateExpression(equate.record.expression, labels, equates, equate.record.span, diagnostics, {
      currentLocation: equate.record.currentLocation,
      visiting: new Set([...(options.visiting ?? []), equate.key]),
      layouts: options.layouts,
      ...(options.reportUnknown !== undefined ? { reportUnknown: options.reportUnknown } : {}),
    });
  }

  if (hasUnqualifiedEnumMember(name, equates)) {
    diagnostics.push(diagnostic(span, `Enum member "${name}" must be qualified.`));
    return undefined;
  }
  if (options.reportUnknown ?? true) {
    diagnostics.push(diagnostic(span, `unknown symbol: ${name}`));
  }
  return undefined;
}

function hasUnqualifiedEnumMember(
  name: string,
  equates: ReadonlyMap<string, EquateRecord>,
): boolean {
  if (name.includes('.')) {
    return false;
  }

  const suffix = `.${name}`;
  for (const [key, record] of equates) {
    if (record.enumMember === true && key.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

function evaluateUnary(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
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
  return applyUnaryOperator(expression.operator, value);
}

function reportInvalidBinaryExpression(
  operator: Extract<Expression, { readonly kind: 'binary' }>['operator'],
  right: number,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): boolean {
  if (operator === '/' && right === 0) {
    diagnostics.push(diagnostic(span, 'Divide by zero in imm expression.'));
    return true;
  }
  if (operator === '%' && right === 0) {
    diagnostics.push(diagnostic(span, 'modulo by zero in expression'));
    return true;
  }
  return false;
}

function evaluateBinary(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
): number | undefined {
  const left = evaluateExpression(expression.left, labels, equates, span, diagnostics, options);
  const right = evaluateExpression(expression.right, labels, equates, span, diagnostics, options);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (reportInvalidBinaryExpression(expression.operator, right, span, diagnostics)) {
    return undefined;
  }
  return applyBinaryOperator(expression.operator, left, right);
}
