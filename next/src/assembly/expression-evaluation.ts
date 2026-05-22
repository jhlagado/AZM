import type { Diagnostic } from '../model/diagnostic.js';
import type {
  Expression,
  LayoutCastPathPart,
  OffsetPathPart,
  TypeExpr,
} from '../model/expression.js';
import type { LayoutField } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';

export interface EquateRecord {
  readonly expression: Expression;
  readonly span: SourceSpan;
  readonly currentLocation: number;
  readonly enumMember?: boolean;
}

export interface LayoutRecord {
  readonly kind: 'record' | 'union';
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
    case 'type-size':
      return evaluateTypeSize(expression.typeExpr, labels, equates, span, diagnostics, options);
    case 'sizeof':
      return evaluateSizeof(expression.typeExpr, options.layouts, span, diagnostics);
    case 'offset':
      return evaluateOffset(
        expression.typeExpr,
        expression.path,
        options.layouts,
        span,
        diagnostics,
      );
    case 'layout-cast':
      return evaluateLayoutCast(expression, labels, equates, span, diagnostics, options);
    case 'symbol':
      return evaluateSymbol(expression.name, labels, equates, span, diagnostics, options);
    case 'unary':
      return evaluateUnary(expression, labels, equates, span, diagnostics, options);
    case 'binary':
      return evaluateBinary(expression, labels, equates, span, diagnostics, options);
  }
}

function evaluateTypeSize(
  typeExpr: TypeExpr,
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

function evaluateLayoutCast(
  expression: Extract<Expression, { readonly kind: 'layout-cast' }>,
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
  const base = evaluateExpression(expression.base, labels, equates, span, diagnostics, options);
  if (base === undefined) {
    return undefined;
  }
  if (!options.layouts) {
    diagnostics.push(diagnostic(span, `unknown type: ${formatTypeExpr(expression.typeExpr)}`));
    return undefined;
  }
  const offset = layoutCastOffset(
    expression.typeExpr,
    expression.path,
    labels,
    equates,
    options.layouts,
    span,
    diagnostics,
    options,
  );
  return offset === undefined ? undefined : base + offset;
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
  typeExpr: TypeExpr,
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): number | undefined {
  if (!layouts) {
    diagnostics.push(diagnostic(span, `unknown type: ${formatTypeExpr(typeExpr)}`));
    return undefined;
  }

  return typeExprSize(typeExpr, layouts, span, diagnostics, new Set([typeExpr.name]));
}

function evaluateOffset(
  typeExpr: TypeExpr,
  path: readonly OffsetPathPart[],
  layouts: ReadonlyMap<string, LayoutRecord> | undefined,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): number | undefined {
  if (!layouts) {
    diagnostics.push(diagnostic(span, `unknown type: ${formatTypeExpr(typeExpr)}`));
    return undefined;
  }

  const diagnosticCount = diagnostics.length;
  const offset = offsetPath(typeExpr, path, layouts, span, diagnostics);
  if (offset !== undefined) {
    return offset;
  }
  if (diagnostics.length === diagnosticCount) {
    diagnostics.push(
      diagnostic(
        span,
        `unknown field "${formatOffsetPath(path)}" in type ${formatTypeExpr(typeExpr)}`,
      ),
    );
  }
  return undefined;
}

function typeExprSize(
  typeExpr: TypeExpr,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  visiting: Set<string>,
): number | undefined {
  const scalar = scalarSize(typeExpr.name);
  const baseSize =
    scalar ??
    (() => {
      const layout = layouts.get(typeExpr.name);
      if (!layout) {
        diagnostics.push(diagnostic(span, `unknown type: ${typeExpr.name}`));
        return undefined;
      }
      return layoutSize(typeExpr.name, layout, layouts, span, diagnostics, visiting);
    })();

  if (baseSize === undefined) {
    return undefined;
  }
  return typeExpr.length === undefined ? baseSize : baseSize * typeExpr.length;
}

function layoutSize(
  typeName: string,
  layout: LayoutRecord,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  visiting: Set<string>,
): number | undefined {
  const fieldSizes: number[] = [];
  for (const field of layout.fields) {
    const size = fieldSize(field, layouts, span, diagnostics, visiting);
    if (size === undefined) {
      return undefined;
    }
    fieldSizes.push(size);
  }

  return layout.kind === 'union'
    ? fieldSizes.reduce((largest, size) => Math.max(largest, size), 0)
    : fieldSizes.reduce((sum, size) => sum + size, 0);
}

function fieldSize(
  field: LayoutField,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  visiting: Set<string>,
): number | undefined {
  if (field.typeExpr === undefined) {
    return field.size;
  }

  if (visiting.has(field.typeExpr.name)) {
    diagnostics.push(diagnostic(span, `recursive type: ${field.typeExpr.name}`));
    return undefined;
  }

  return typeExprSize(
    field.typeExpr,
    layouts,
    span,
    diagnostics,
    new Set([...visiting, field.typeExpr.name]),
  );
}

function offsetPath(
  typeExpr: TypeExpr,
  parts: readonly OffsetPathPart[],
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): number | undefined {
  const [head, ...tail] = parts;
  if (head === undefined) {
    return undefined;
  }

  if (head.kind === 'index') {
    if (typeExpr.length === undefined) {
      return undefined;
    }
    if (head.index >= typeExpr.length) {
      diagnostics.push(
        diagnostic(span, `array index ${head.index} out of range for ${formatTypeExpr(typeExpr)}`),
      );
      return undefined;
    }
    const elementTypeExpr = { name: typeExpr.name };
    const stride = typeExprSize(
      elementTypeExpr,
      layouts,
      span,
      diagnostics,
      new Set([typeExpr.name]),
    );
    if (stride === undefined) {
      return undefined;
    }
    if (tail.length === 0) {
      return head.index * stride;
    }
    const nestedOffset = offsetPath(elementTypeExpr, tail, layouts, span, diagnostics);
    return nestedOffset === undefined ? undefined : head.index * stride + nestedOffset;
  }

  if (typeExpr.length !== undefined) {
    return undefined;
  }

  const layout = layouts.get(typeExpr.name);
  if (!layout) {
    diagnostics.push(diagnostic(span, `unknown type: ${typeExpr.name}`));
    return undefined;
  }

  let currentOffset = 0;
  for (const field of layout.fields) {
    const fieldOffset = layout.kind === 'union' ? 0 : currentOffset;
    if (field.name === head.name) {
      if (field.typeExpr !== undefined) {
        const size = fieldSize(field, layouts, span, diagnostics, new Set([typeExpr.name]));
        if (size === undefined) {
          return undefined;
        }
      }

      if (tail.length === 0) {
        return fieldOffset;
      }

      if (field.typeExpr === undefined) {
        return undefined;
      }
      const nestedOffset = offsetPath(field.typeExpr, tail, layouts, span, diagnostics);
      return nestedOffset === undefined ? undefined : fieldOffset + nestedOffset;
    }

    const size = fieldSize(field, layouts, span, diagnostics, new Set([typeExpr.name]));
    if (size === undefined) {
      return undefined;
    }
    currentOffset += size;
  }

  return undefined;
}

function layoutCastOffset(
  typeExpr: TypeExpr,
  parts: readonly LayoutCastPathPart[],
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: {
    readonly currentLocation: number;
    readonly visiting?: ReadonlySet<string>;
    readonly reportUnknown?: boolean;
  },
): number | undefined {
  const [head, ...tail] = parts;
  if (head === undefined) {
    return 0;
  }

  if (head.kind === 'index') {
    if (typeExpr.length === undefined) {
      return undefined;
    }
    const index = evaluateExpression(head.expression, labels, equates, span, diagnostics, {
      ...options,
      layouts,
    });
    if (index === undefined) {
      return undefined;
    }
    if (index < 0 || index >= typeExpr.length) {
      diagnostics.push(
        diagnostic(span, `array index ${index} out of range for ${formatTypeExpr(typeExpr)}`),
      );
      return undefined;
    }
    const elementTypeExpr = { name: typeExpr.name };
    const stride = typeExprSize(
      elementTypeExpr,
      layouts,
      span,
      diagnostics,
      new Set([typeExpr.name]),
    );
    if (stride === undefined) {
      return undefined;
    }
    const nestedOffset = layoutCastOffset(
      elementTypeExpr,
      tail,
      labels,
      equates,
      layouts,
      span,
      diagnostics,
      options,
    );
    return nestedOffset === undefined ? undefined : index * stride + nestedOffset;
  }

  if (typeExpr.length !== undefined) {
    return undefined;
  }

  const layout = layouts.get(typeExpr.name);
  if (!layout) {
    diagnostics.push(diagnostic(span, `unknown type: ${typeExpr.name}`));
    return undefined;
  }

  let currentOffset = 0;
  for (const field of layout.fields) {
    const fieldOffset = layout.kind === 'union' ? 0 : currentOffset;
    if (field.name === head.name) {
      if (field.typeExpr !== undefined) {
        const size = fieldSize(field, layouts, span, diagnostics, new Set([typeExpr.name]));
        if (size === undefined) {
          return undefined;
        }
      }

      if (tail.length === 0) {
        return fieldOffset;
      }
      if (field.typeExpr === undefined) {
        return undefined;
      }
      const nestedOffset = layoutCastOffset(
        field.typeExpr,
        tail,
        labels,
        equates,
        layouts,
        span,
        diagnostics,
        options,
      );
      return nestedOffset === undefined ? undefined : fieldOffset + nestedOffset;
    }

    const size = fieldSize(field, layouts, span, diagnostics, new Set([typeExpr.name]));
    if (size === undefined) {
      return undefined;
    }
    currentOffset += size;
  }

  return undefined;
}

function formatTypeExpr(typeExpr: TypeExpr): string {
  return typeExpr.length === undefined ? typeExpr.name : `${typeExpr.name}[${typeExpr.length}]`;
}

function formatOffsetPath(path: readonly OffsetPathPart[]): string {
  return path.map((part) => (part.kind === 'field' ? part.name : `[${part.index}]`)).join('.');
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
