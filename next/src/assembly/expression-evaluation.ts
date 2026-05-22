import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { LayoutField } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';

export interface EquateRecord {
  readonly expression: Expression;
  readonly span: SourceSpan;
  readonly currentLocation: number;
  readonly enumMember?: boolean;
}

export interface LayoutRecord {
  readonly fields: readonly LayoutField[];
}

export function evaluateExpression(
  expression: Expression,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: {
    readonly currentLocation: number;
    readonly layouts?: ReadonlyMap<string, LayoutRecord> | undefined;
    readonly visiting?: ReadonlySet<string>;
    readonly reportUnknown?: boolean;
  },
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'current-location':
      return options.currentLocation;
    case 'sizeof':
      return evaluateSizeof(expression.typeName, options.layouts, span, diagnostics);
    case 'offset':
      return evaluateOffset(
        expression.typeName,
        expression.fieldName,
        options.layouts,
        span,
        diagnostics,
      );
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
    readonly layouts?: ReadonlyMap<string, LayoutRecord> | undefined;
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
      layouts: options.layouts,
    });
  }

  if (options.reportUnknown ?? true) {
    if (hasUnqualifiedEnumMember(name, equates)) {
      diagnostics.push(diagnostic(span, `Enum member "${name}" must be qualified.`));
      return undefined;
    }
    diagnostics.push(diagnostic(span, `unknown symbol: ${name}`));
  }
  return undefined;
}

function evaluateSizeof(
  typeName: string,
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): number | undefined {
  const scalar = scalarSize(typeName);
  if (scalar !== undefined) {
    return scalar;
  }

  const layout = layouts?.get(typeName);
  if (!layout) {
    diagnostics.push(diagnostic(span, `unknown type: ${typeName}`));
    return undefined;
  }
  return layout.fields.reduce((sum, field) => sum + field.size, 0);
}

function evaluateOffset(
  typeName: string,
  fieldName: string,
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): number | undefined {
  const layout = layouts?.get(typeName);
  if (!layout) {
    diagnostics.push(diagnostic(span, `unknown type: ${typeName}`));
    return undefined;
  }

  let offset = 0;
  for (const field of layout.fields) {
    if (field.name === fieldName) {
      return offset;
    }
    offset += field.size;
  }
  diagnostics.push(diagnostic(span, `unknown field "${fieldName}" in type ${typeName}`));
  return undefined;
}

function scalarSize(typeName: string): number | undefined {
  switch (typeName.toLowerCase()) {
    case 'byte':
      return 1;
    case 'word':
    case 'addr':
      return 2;
    default:
      return undefined;
  }
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
