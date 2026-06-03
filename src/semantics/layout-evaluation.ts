import type { Diagnostic } from '../model/diagnostic.js';
import type {
  Expression,
  LayoutCastPathPart,
  OffsetPathPart,
  TypeExpr,
} from '../model/expression.js';
import type { LayoutField } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import { diagnostic } from './diagnostics.js';
import type { EquateRecord, EvaluateExpressionOptions } from './expression-evaluation.js';
import {
  formatOffsetPath,
  formatTypeExpr,
  registerIndexName,
  scalarSize,
} from './layout-format.js';
import { arrayElementOffset, fieldPathOffset } from './layout-path.js';

export type LayoutRecord =
  | {
      readonly kind: 'record' | 'union';
      readonly fields: readonly LayoutField[];
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'alias';
      readonly typeExpr: TypeExpr;
      readonly span: SourceSpan;
    };

type EvaluateNestedExpression = (
  expression: Expression,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
) => number | undefined;

export function evaluateSizeof(
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

export function evaluateOffset(
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

export function evaluateLayoutCast(
  expression: Extract<Expression, { readonly kind: 'layout-cast' }>,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
  evaluateExpression: EvaluateNestedExpression,
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
    evaluateExpression,
  );
  return offset === undefined ? undefined : base + offset;
}

export function validateLayouts(
  layouts: ReadonlyMap<string, LayoutRecord>,
  diagnostics: Diagnostic[],
): void {
  for (const [name, layout] of layouts) {
    layoutSize(name, layout, layouts, layout.span, diagnostics, new Set([name]));
  }
}

export function typeExprSize(
  typeExpr: TypeExpr,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  visiting: Set<string>,
): number | undefined {
  const resolvedTypeExpr = resolveLayoutAlias(typeExpr, layouts, span, diagnostics, visiting);
  if (!resolvedTypeExpr) {
    return undefined;
  }
  if (resolvedTypeExpr !== typeExpr) {
    return typeExprSize(resolvedTypeExpr, layouts, span, diagnostics, visiting);
  }

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
  if (layout.kind === 'alias') {
    return typeExprSize(layout.typeExpr, layouts, span, diagnostics, visiting);
  }

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
    diagnostics.push(
      diagnostic(
        span,
        visiting.size === 1
          ? `Self-referential field type "${field.typeExpr.name}" has no finite size; use .addr for a pointer field.`
          : `recursive type: ${field.typeExpr.name}`,
      ),
    );
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
  const resolvedTypeExpr = resolveLayoutAlias(typeExpr, layouts, span, diagnostics, new Set([typeExpr.name]));
  if (!resolvedTypeExpr) {
    return undefined;
  }
  if (resolvedTypeExpr !== typeExpr) {
    return offsetPath(resolvedTypeExpr, parts, layouts, span, diagnostics);
  }

  const [head, ...tail] = parts;
  if (head === undefined) {
    return undefined;
  }

  if (head.kind === 'index') {
    return staticArrayOffset(typeExpr, head.index, tail, layouts, span, diagnostics);
  }

  return fieldPathOffset({
    typeExpr,
    head,
    tail,
    layouts,
    span,
    diagnostics,
    fieldSize: (field, ownerTypeExpr) =>
      fieldSize(field, layouts, span, diagnostics, new Set([ownerTypeExpr.name])),
    nestedOffset: (fieldTypeExpr, nestedTail) =>
      offsetPath(fieldTypeExpr, nestedTail, layouts, span, diagnostics),
  });
}

function layoutCastOffset(
  typeExpr: TypeExpr,
  parts: readonly LayoutCastPathPart[],
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
  evaluateExpression: EvaluateNestedExpression,
): number | undefined {
  const resolvedTypeExpr = resolveLayoutAlias(typeExpr, layouts, span, diagnostics, new Set([typeExpr.name]));
  if (!resolvedTypeExpr) {
    return undefined;
  }
  if (resolvedTypeExpr !== typeExpr) {
    return layoutCastOffset(
      resolvedTypeExpr,
      parts,
      labels,
      equates,
      layouts,
      span,
      diagnostics,
      options,
      evaluateExpression,
    );
  }

  const [head, ...tail] = parts;
  if (head === undefined) {
    return 0;
  }

  if (head.kind === 'index') {
    const index = evaluateLayoutCastIndex(
      head.expression,
      typeExpr,
      labels,
      equates,
      layouts,
      span,
      diagnostics,
      options,
      evaluateExpression,
    );
    if (index === undefined) {
      return undefined;
    }
    return dynamicArrayOffset(typeExpr, index, tail, labels, equates, layouts, span, diagnostics, options, evaluateExpression);
  }

  return fieldPathOffset({
    typeExpr,
    head,
    tail,
    layouts,
    span,
    diagnostics,
    fieldSize: (field, ownerTypeExpr) =>
      fieldSize(field, layouts, span, diagnostics, new Set([ownerTypeExpr.name])),
    nestedOffset: (fieldTypeExpr, nestedTail) =>
      layoutCastOffset(
        fieldTypeExpr,
        nestedTail,
        labels,
        equates,
        layouts,
        span,
        diagnostics,
        options,
        evaluateExpression,
      ),
  });
}

function staticArrayOffset(
  typeExpr: TypeExpr,
  index: number,
  tail: readonly OffsetPathPart[],
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
): number | undefined {
  if (typeExpr.length === undefined) {
    return undefined;
  }
  if (index >= typeExpr.length) {
    diagnostics.push(
      diagnostic(span, `array index ${index} out of range for ${formatTypeExpr(typeExpr)}`),
    );
    return undefined;
  }

  return arrayElementOffset(
    typeExpr,
    index,
    tail,
    (elementTypeExpr) =>
      typeExprSize(elementTypeExpr, layouts, span, diagnostics, new Set([typeExpr.name])),
    (elementTypeExpr, nestedTail) => offsetPath(elementTypeExpr, nestedTail, layouts, span, diagnostics),
  );
}

function dynamicArrayOffset(
  typeExpr: TypeExpr,
  index: number,
  tail: readonly LayoutCastPathPart[],
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
  evaluateExpression: EvaluateNestedExpression,
): number | undefined {
  return arrayElementOffset(
    typeExpr,
    index,
    tail,
    (elementTypeExpr) =>
      typeExprSize(elementTypeExpr, layouts, span, diagnostics, new Set([typeExpr.name])),
    (elementTypeExpr, nestedTail) =>
      layoutCastOffset(
        elementTypeExpr,
        nestedTail,
        labels,
        equates,
        layouts,
        span,
        diagnostics,
        options,
        evaluateExpression,
      ),
  );
}

function evaluateLayoutCastIndex(
  expression: Expression,
  typeExpr: TypeExpr,
  labels: Readonly<Record<string, number>>,
  equates: ReadonlyMap<string, EquateRecord>,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  options: EvaluateExpressionOptions,
  evaluateExpression: EvaluateNestedExpression,
): number | undefined {
  if (typeExpr.length === undefined) {
    return undefined;
  }

  const registerName = registerIndexName(expression);
  if (registerName) {
    diagnostics.push(
      diagnostic(span, `runtime register index "${registerName}" is not supported in layout casts`),
    );
    return undefined;
  }

  const index = evaluateExpression(expression, labels, equates, span, diagnostics, {
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
  return index;
}

function resolveLayoutAlias(
  typeExpr: TypeExpr,
  layouts: ReadonlyMap<string, LayoutRecord>,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  visiting: Set<string>,
): TypeExpr | undefined {
  const layout = layouts.get(typeExpr.name);
  if (!layout || layout.kind !== 'alias') {
    return typeExpr;
  }
  if (visiting.has(layout.typeExpr.name)) {
    diagnostics.push(diagnostic(span, `recursive type: ${typeExpr.name}`));
    return undefined;
  }

  const target = resolveLayoutAlias(
    layout.typeExpr,
    layouts,
    span,
    diagnostics,
    new Set([...visiting, layout.typeExpr.name]),
  );
  if (!target) {
    return undefined;
  }

  const length =
    typeExpr.length === undefined
      ? target.length
      : (target.length ?? 1) * typeExpr.length;
  return length === undefined ? { name: target.name } : { name: target.name, length };
}
