/**
 * typeQueries.ts — semantic-layer type-resolution helpers.
 *
 * These helpers are purely semantic: they walk type expressions and EA paths
 * using the compile environment and explicit layout casts, but they know
 * nothing about placed/lowered program state or code-generation concerns.
 *
 * The lowering layer imports these helpers directly.
 */

import type { EaExprNode, RecordFieldNode, TypeExprNode } from '../frontend/ast.js';
import type { CompileEnv } from './env.js';

export type ScalarKind = 'byte' | 'word' | 'addr';
export type AggregateType = { kind: 'record' | 'union'; fields: RecordFieldNode[] };

type TypeResolutionContext = {
  env: CompileEnv;
};

export function createTypeResolutionHelpers(ctx: TypeResolutionContext) {
  const resolveScalarKind = (typeExpr: TypeExprNode): ScalarKind | undefined => {
    if (typeExpr.kind !== 'TypeName') return undefined;
    const lower = typeExpr.name.toLowerCase();
    if (lower === 'byte' || lower === 'word' || lower === 'addr') return lower;
    return undefined;
  };

  const resolveAggregateType = (te: TypeExprNode): AggregateType | undefined => {
    if (te.kind === 'RecordType') return { kind: 'record', fields: te.fields };
    if (te.kind === 'TypeName') {
      const decl = ctx.env.types.get(te.name);
      if (!decl) return undefined;
      if (decl.kind === 'UnionDecl') return { kind: 'union', fields: decl.fields };
      if (decl.typeExpr.kind === 'RecordType') {
        return { kind: 'record', fields: decl.typeExpr.fields };
      }
    }
    return undefined;
  };

  const resolveArrayType = (
    te: TypeExprNode,
  ): { element: TypeExprNode; length?: number } | undefined => {
    if (te.kind !== 'ArrayType') return undefined;
    return te.length === undefined
      ? { element: te.element }
      : { element: te.element, length: te.length };
  };

  const typeDisplay = (te: TypeExprNode): string => {
    const render = (x: TypeExprNode): string => {
      if (x.kind === 'TypeName') return x.name;
      if (x.kind === 'ArrayType') {
        const inner = render(x.element);
        return `${inner}[${x.length === undefined ? '' : x.length}]`;
      }
      if (x.kind === 'RecordType') {
        return `record{${x.fields.map((f) => `${f.name}:${render(f.typeExpr)}`).join(',')}}`;
      }
      return 'type';
    };
    return render(te);
  };

  const sameTypeShape = (left: TypeExprNode, right: TypeExprNode): boolean => {
    if (left.kind !== right.kind) return false;
    switch (left.kind) {
      case 'TypeName':
        return right.kind === 'TypeName' && left.name.toLowerCase() === right.name.toLowerCase();
      case 'ArrayType':
        if (right.kind !== 'ArrayType') return false;
        if (left.length !== right.length) return false;
        return sameTypeShape(left.element, right.element);
      case 'RecordType':
        if (right.kind !== 'RecordType') return false;
        if (left.fields.length !== right.fields.length) return false;
        for (let i = 0; i < left.fields.length; i++) {
          const lf = left.fields[i]!;
          const rf = right.fields[i]!;
          if (lf.name !== rf.name || !sameTypeShape(lf.typeExpr, rf.typeExpr)) return false;
        }
        return true;
    }
  };

  const resolveEaTypeExprInternal = (ea: EaExprNode): TypeExprNode | undefined => {
    switch (ea.kind) {
      case 'EaName':
        return undefined;
      case 'EaAdd':
      case 'EaSub':
        return resolveEaTypeExprInternal(ea.base);
      case 'EaLayoutCast': {
        return ea.typeExpr;
      }
      case 'EaField': {
        const baseType = resolveEaTypeExprInternal(ea.base);
        if (!baseType) return undefined;
        const agg = resolveAggregateType(baseType);
        if (!agg) return undefined;
        for (const f of agg.fields) {
          if (f.name === ea.field) return f.typeExpr;
        }
        return undefined;
      }
      case 'EaIndex': {
        const baseType = resolveEaTypeExprInternal(ea.base);
        if (!baseType) return undefined;
        return resolveArrayType(baseType)?.element;
      }
      case 'EaImm':
        return undefined;
    }
  };

  const resolveEaTypeExpr = (ea: EaExprNode): TypeExprNode | undefined =>
    resolveEaTypeExprInternal(ea);

  return {
    resolveScalarKind,
    resolveAggregateType,
    resolveArrayType,
    resolveEaTypeExpr,
    sameTypeShape,
    typeDisplay,
  };
}
