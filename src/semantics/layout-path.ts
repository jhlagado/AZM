import type { Diagnostic } from '../model/diagnostic.js';
import type { LayoutCastPathPart, OffsetPathPart, TypeExpr } from '../model/expression.js';
import type { LayoutField } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import { diagnostic } from './diagnostics.js';
import type { LayoutRecord } from './layout-evaluation.js';

type PathPart = OffsetPathPart | LayoutCastPathPart;
type FieldPathHead = Extract<PathPart, { readonly kind: 'field' }>;

type TypeSize = (typeExpr: TypeExpr) => number | undefined;
type FieldSize = (field: LayoutField, ownerTypeExpr: TypeExpr) => number | undefined;

type FieldOffsetOptions<TPart extends PathPart> = {
  readonly typeExpr: TypeExpr;
  readonly head: FieldPathHead;
  readonly tail: readonly TPart[];
  readonly layouts: ReadonlyMap<string, LayoutRecord>;
  readonly span: SourceSpan;
  readonly diagnostics: Diagnostic[];
  readonly fieldSize: FieldSize;
  readonly nestedOffset: (typeExpr: TypeExpr, tail: readonly TPart[]) => number | undefined;
};

export function arrayElementOffset<TPart extends PathPart>(
  typeExpr: TypeExpr,
  index: number,
  tail: readonly TPart[],
  typeSize: TypeSize,
  nestedOffset: (typeExpr: TypeExpr, tail: readonly TPart[]) => number | undefined,
): number | undefined {
  const elementTypeExpr = { name: typeExpr.name };
  const stride = typeSize(elementTypeExpr);
  if (stride === undefined) {
    return undefined;
  }
  if (tail.length === 0) {
    return index * stride;
  }

  const nested = nestedOffset(elementTypeExpr, tail);
  return nested === undefined ? undefined : index * stride + nested;
}

export function fieldPathOffset<TPart extends PathPart>({
  typeExpr,
  head,
  tail,
  layouts,
  span,
  diagnostics,
  fieldSize,
  nestedOffset,
}: FieldOffsetOptions<TPart>): number | undefined {
  if (typeExpr.length !== undefined) {
    return undefined;
  }

  const layout = layouts.get(typeExpr.name);
  if (!layout) {
    diagnostics.push(diagnostic(span, `unknown type: ${typeExpr.name}`));
    return undefined;
  }
  if (layout.kind === 'alias') {
    return nestedOffset(layout.typeExpr, [head, ...tail] as readonly TPart[]);
  }

  return findFieldOffset(typeExpr, layout, head, tail, fieldSize, nestedOffset);
}

function findFieldOffset<TPart extends PathPart>(
  typeExpr: TypeExpr,
  layout: Extract<LayoutRecord, { readonly kind: 'record' | 'union' }>,
  head: FieldPathHead,
  tail: readonly TPart[],
  fieldSize: FieldSize,
  nestedOffset: (typeExpr: TypeExpr, tail: readonly TPart[]) => number | undefined,
): number | undefined {
  let currentOffset = 0;
  for (const field of layout.fields) {
    const foundOffset =
      field.name === head.name
        ? selectedFieldOffset(typeExpr, layout.kind, field, currentOffset, tail, fieldSize, nestedOffset)
        : undefined;
    if (foundOffset !== undefined) {
      return foundOffset;
    }

    const size = fieldSize(field, typeExpr);
    if (size === undefined) {
      return undefined;
    }
    currentOffset += size;
  }
  return undefined;
}

function selectedFieldOffset<TPart extends PathPart>(
  typeExpr: TypeExpr,
  layoutKind: 'record' | 'union',
  field: LayoutField,
  currentOffset: number,
  tail: readonly TPart[],
  fieldSize: FieldSize,
  nestedOffset: (typeExpr: TypeExpr, tail: readonly TPart[]) => number | undefined,
): number | undefined {
  const fieldOffset = layoutKind === 'union' ? 0 : currentOffset;
  if (field.typeExpr !== undefined && fieldSize(field, typeExpr) === undefined) {
    return undefined;
  }

  if (tail.length === 0) {
    return fieldOffset;
  }
  if (field.typeExpr === undefined) {
    return undefined;
  }
  const nested = nestedOffset(field.typeExpr, tail);
  return nested === undefined ? undefined : fieldOffset + nested;
}
