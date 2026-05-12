/**
 * typeQueries.ts — semantic-layer type-resolution helpers.
 *
 * These helpers are purely semantic: they walk type expressions and EA paths
 * using the compile environment and the storage-view maps, but they know
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
import { resolveVisibleType } from '../moduleVisibility.js';
import type { CompileEnv } from './env.js';

export type ScalarKind = 'byte' | 'word' | 'addr';
export type AggregateType = { kind: 'record' | 'union'; fields: RecordFieldNode[] };

type TypeResolutionContext = {
  env: CompileEnv;
  storageTypes: Map<string, TypeExprNode>;
  stackSlotTypes: Map<string, TypeExprNode>;
  rawAddressSymbols: Set<string>;
  moduleAliasTargets: Map<string, EaExprNode>;
  getLocalAliasTargets: () => Map<string, EaExprNode>;
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
    const decl = resolveVisibleType(typeExpr.name, typeExpr.span.file, ctx.env);
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
      const decl = resolveVisibleType(te.name, te.span.file, ctx.env);
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
      const decl = resolveVisibleType(te.name, te.span.file, ctx.env);
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
    const decl = resolveVisibleType(te.name, te.span.file, ctx.env);
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

  const resolveEaBaseName = (ea: EaExprNode): string | undefined => {
    switch (ea.kind) {
      case 'EaName':
        return ea.name;
      case 'EaImm':
        return undefined;
      case 'EaReinterpret':
        return resolveEaBaseName(ea.base);
      case 'EaField':
      case 'EaIndex':
      case 'EaAdd':
      case 'EaSub':
        return resolveEaBaseName(ea.base);
    }
  };

  const resolveAliasTarget = (nameLower: string): EaExprNode | undefined =>
    ctx.getLocalAliasTargets().get(nameLower) ?? ctx.moduleAliasTargets.get(nameLower);

  const resolveEaTypeExprInternal = (
    ea: EaExprNode,
    visitingAliases: Set<string>,
  ): TypeExprNode | undefined => {
    switch (ea.kind) {
      case 'EaName': {
        const lower = ea.name.toLowerCase();
        const direct = ctx.stackSlotTypes.get(lower) ?? ctx.storageTypes.get(lower);
        if (direct) return direct;
        const aliasTarget = resolveAliasTarget(lower);
        if (!aliasTarget) return undefined;
        if (visitingAliases.has(lower)) return undefined;
        visitingAliases.add(lower);
        try {
          return resolveEaTypeExprInternal(aliasTarget, visitingAliases);
        } finally {
          visitingAliases.delete(lower);
        }
      }
      case 'EaAdd':
      case 'EaSub':
        return resolveEaTypeExprInternal(ea.base, visitingAliases);
      case 'EaReinterpret': {
        const resolved = unwrapTypeAlias(ea.typeExpr);
        return resolved ?? ea.typeExpr;
      }
      case 'EaField': {
        const baseType = resolveEaTypeExprInternal(ea.base, visitingAliases);
        if (!baseType) return undefined;
        const agg = resolveAggregateType(baseType) ?? resolvePointedToType(baseType);
        if (!agg) return undefined;
        for (const f of agg.fields) {
          if (f.name === ea.field) return f.typeExpr;
        }
        return undefined;
      }
      case 'EaIndex': {
        const baseType = resolveEaTypeExprInternal(ea.base, visitingAliases);
        if (!baseType) return undefined;
        return resolveArrayElementType(baseType);
      }
      case 'EaImm':
        return undefined;
    }
  };

  const resolveEaTypeExpr = (ea: EaExprNode): TypeExprNode | undefined =>
    resolveEaTypeExprInternal(ea, new Set<string>());

  const stackSlotAggregateIsAddrWidth = (
    nameLower: string,
    typeExpr: TypeExprNode,
  ): boolean =>
    ctx.stackSlotTypes.has(nameLower) && resolveAggregateType(typeExpr) !== undefined;

  const resolveScalarBinding = (name: string): ScalarKind | undefined => {
    const lower = name.toLowerCase();
    if (ctx.rawAddressSymbols.has(lower)) return undefined;
    const typeExpr =
      ctx.stackSlotTypes.get(lower) ??
      ctx.storageTypes.get(lower) ??
      (() => {
        const aliasTarget = resolveAliasTarget(lower);
        if (!aliasTarget) return undefined;
        return resolveEaTypeExpr(aliasTarget);
      })();
    if (!typeExpr) return undefined;
    const sk = resolveScalarKind(typeExpr);
    if (sk) return sk;
    if (stackSlotAggregateIsAddrWidth(lower, typeExpr)) return 'addr';
    return undefined;
  };

  /**
   * Record/union-typed locals occupy one addr-sized frame slot that stores a
   * pointer; value loads (ld, calls, mem push) must use the word at that slot,
   * not the slot address. When `resolveScalarKind(typeExpr)` is undefined but
   * the name is a stack slot with an aggregate type, treat as `addr` width.
   */
  const scalarKindForEaValueSemantics = (
    ea: EaExprNode,
    typeExpr: TypeExprNode,
  ): ScalarKind | undefined => {
    const sk = resolveScalarKind(typeExpr);
    if (sk) return sk;
    if (ea.kind === 'EaName' && stackSlotAggregateIsAddrWidth(ea.name.toLowerCase(), typeExpr)) {
      return 'addr';
    }
    return undefined;
  };

  /**
   * Resolve the scalar kind for a general EA value access. Raw-address symbols
   * intentionally stay non-scalar here so address-only declarations are not
   * mistaken for loadable/storable values.
   */
  const resolveScalarTypeForEa = (ea: EaExprNode): ScalarKind | undefined => {
    const base = resolveEaBaseName(ea);
    if (base && ctx.rawAddressSymbols.has(base.toLowerCase())) return undefined;
    const typeExpr = resolveEaTypeExpr(ea);
    if (!typeExpr) return undefined;
    return scalarKindForEaValueSemantics(ea, typeExpr);
  };

  /**
   * Resolve the scalar kind for ld-specific coercion. This is slightly broader
   * than resolveScalarTypeForEa because indexed data-array accesses still count
   * as value loads/stores even when their base declaration is address-only.
   */
  const resolveScalarTypeForLd = (ea: EaExprNode): ScalarKind | undefined => {
    if (ea.kind === 'EaName' && ctx.rawAddressSymbols.has(ea.name.toLowerCase())) return undefined;
    const typeExpr = resolveEaTypeExpr(ea);
    if (!typeExpr) return undefined;
    return scalarKindForEaValueSemantics(ea, typeExpr);
  };

  return {
    resolveScalarKind,
    resolveAggregateType,
    resolvePointedToType,
    resolveArrayType,
    resolveEaTypeExpr,
    resolveScalarBinding,
    resolveScalarTypeForEa,
    resolveScalarTypeForLd,
    sameTypeShape,
    typeDisplay,
  };
}
