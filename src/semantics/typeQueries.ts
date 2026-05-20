/**
 * typeQueries.ts — semantic-layer type-resolution helpers.
 *
 * These helpers are purely semantic: they walk type expressions and EA paths
 * using the compile environment and explicit layout casts, but they know
 * nothing about placed/lowered program state or code-generation concerns.
 *
 * The lowering layer re-exports from this module via
 * `src/lowering/typeResolution.ts` so that existing lowering imports continue
 * to work without change.
 */

import type {
  EaExprNode,
  RecordFieldNode,
  TypeExprNode,
} from '../frontend/ast.js';
import type { CompileEnv } from './env.js';

export type ScalarKind = 'byte' | 'word' | 'addr';
export type AggregateType = { kind: 'record' | 'union'; fields: RecordFieldNode[] };

type TypeResolutionContext = {
  env: CompileEnv;
};

export function createTypeResolutionHelpers(ctx: TypeResolutionContext) {
  const resolveScalarKind = (
    typeExpr: TypeExprNode,
    seen: Set<string> = new Set(),
  ): ScalarKind | undefined => {
    if (typeExpr.kind === 'AddrOfType') return 'addr';
    if (typeExpr.kind !== 'TypeName') return undefined;
    const lower = typeExpr.name.toLowerCase();
    if (lower === 'byte' || lower === 'word' || lower === 'addr') return lower;
    if (seen.has(lower)) return undefined;
    seen.add(lower);
    const decl = ctx.env.types.get(typeExpr.name);
    if (!decl || decl.kind !== 'TypeDecl') return undefined;
    return resolveScalarKind(decl.typeExpr, seen);
  };

  /**
   * If `typeExpr` is `@T`, returns the aggregate shape of `T` when `T` is a record or union; otherwise `undefined`.
   */
  const resolvePointedToType = (te: TypeExprNode): AggregateType | undefined => {
    if (te.kind !== 'AddrOfType') return undefined;
    return resolveAggregateType(te.target);
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

  const resolveArrayElementType = (te: TypeExprNode): TypeExprNode | undefined => {
    if (te.kind === 'ArrayType') return te.element;
    if (te.kind === 'TypeName') {
      const decl = ctx.env.types.get(te.name);
      if (decl?.kind === 'TypeDecl' && decl.typeExpr.kind === 'ArrayType') {
        return decl.typeExpr.element;
      }
    }
    return undefined;
  };

  const unwrapTypeAlias = (
    te: TypeExprNode,
    seen: Set<string> = new Set(),
  ): TypeExprNode | undefined => {
    if (te.kind !== 'TypeName') return te;
    const scalar = resolveScalarKind(te);
    if (scalar) {
      return { kind: 'TypeName', span: te.span, name: scalar === 'addr' ? 'addr' : scalar };
    }
    const lower = te.name.toLowerCase();
    if (seen.has(lower)) return undefined;
    seen.add(lower);
    const decl = ctx.env.types.get(te.name);
    if (!decl || decl.kind !== 'TypeDecl') return te;
    return unwrapTypeAlias(decl.typeExpr, seen);
  };

  const resolveArrayType = (
    te: TypeExprNode,
  ): { element: TypeExprNode; length?: number } | undefined => {
    const resolved = unwrapTypeAlias(te);
    if (!resolved || resolved.kind !== 'ArrayType') return undefined;
    return resolved.length === undefined
      ? { element: resolved.element }
      : { element: resolved.element, length: resolved.length };
  };

  const typeDisplay = (te: TypeExprNode): string => {
    const render = (x: TypeExprNode): string => {
      if (x.kind === 'TypeName') return x.name;
      if (x.kind === 'AddrOfType') return `@${render(x.target)}`;
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
    const l = unwrapTypeAlias(left);
    const r = unwrapTypeAlias(right);
    if (!l || !r) return false;
    if (l.kind !== r.kind) return false;
    switch (l.kind) {
      case 'TypeName':
        return r.kind === 'TypeName' && l.name.toLowerCase() === r.name.toLowerCase();
      case 'AddrOfType':
        return r.kind === 'AddrOfType' && sameTypeShape(l.target, r.target);
      case 'ArrayType':
        if (r.kind !== 'ArrayType') return false;
        if (l.length !== r.length) return false;
        return sameTypeShape(l.element, r.element);
      case 'RecordType':
        if (r.kind !== 'RecordType') return false;
        if (l.fields.length !== r.fields.length) return false;
        for (let i = 0; i < l.fields.length; i++) {
          const lf = l.fields[i]!;
          const rf = r.fields[i]!;
          if (lf.name !== rf.name || !sameTypeShape(lf.typeExpr, rf.typeExpr)) return false;
        }
        return true;
    }
  };

  const resolveEaTypeExprInternal = (
    ea: EaExprNode,
  ): TypeExprNode | undefined => {
    switch (ea.kind) {
      case 'EaName':
        return undefined;
      case 'EaAdd':
      case 'EaSub':
        return resolveEaTypeExprInternal(ea.base);
      case 'EaLayoutCast': {
        const resolved = unwrapTypeAlias(ea.typeExpr);
        return resolved ?? ea.typeExpr;
      }
      case 'EaField': {
        const baseType = resolveEaTypeExprInternal(ea.base);
        if (!baseType) return undefined;
        const agg = resolveAggregateType(baseType) ?? resolvePointedToType(baseType);
        if (!agg) return undefined;
        for (const f of agg.fields) {
          if (f.name === ea.field) return f.typeExpr;
        }
        return undefined;
      }
      case 'EaIndex': {
        const baseType = resolveEaTypeExprInternal(ea.base);
        if (!baseType) return undefined;
        return resolveArrayElementType(baseType);
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
    resolvePointedToType,
    resolveArrayType,
    resolveEaTypeExpr,
    sameTypeShape,
    typeDisplay,
  };
}
