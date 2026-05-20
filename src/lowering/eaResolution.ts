import type { Diagnostic } from '../diagnosticTypes.js';
import type { EaExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import { evalImmExpr, type CompileEnv } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import {
  foldLayoutCastAbsEa,
  isLayoutCastLabelBase,
} from '../semantics/layoutCastFold.js';

export type EaResolution =
  {
    /** Resolved global/absolute label or numeric base. */
    kind: 'abs';
    /** Lowercased symbol name or stringified numeric base for fixups. */
    baseLower: string;
    /** Byte offset added to the base symbol. */
    addend: number;
    /** Optional inferred type at this address; omit when unknown. */
    typeExpr?: TypeExprNode;
  };

/** Maps, env, and type hooks used by {@link createEaResolutionHelpers} — not the full assembler-lowering context. */
export type EAResolutionContext = {
  /** Compile-time const/enum/type environment for imm evaluation. */
  env: CompileEnv;
  /** Mutable diagnostic list for resolution errors. */
  diagnostics: Diagnostic[];
  /** Appends a span-attached diagnostic. */
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  /** Evaluates immediates with diagnostics; `undefined` if ill-typed or non-const. */
  evalImmExpr: (expr: import('../frontend/ast.js').ImmExprNode) => number | undefined;
  /** Evaluates immediates without recording diagnostics (best-effort). */
  evalImmNoDiag: (expr: import('../frontend/ast.js').ImmExprNode) => number | undefined;
  /** Classifies scalar kinds for layout; `undefined` if not a scalar shape. */
  resolveScalarKind: (typeExpr: TypeExprNode) => 'byte' | 'word' | 'addr' | undefined;
  /** Unwraps record/union for field walk; `undefined` if not aggregate. */
  resolveAggregateType: (
    te: TypeExprNode,
  ) => { kind: 'record' | 'union'; fields: import('../frontend/ast.js').RecordFieldNode[] } | undefined;
  /** For `@T`, aggregate shape of `T` when `T` is record/union; else `undefined`. */
  resolvePointedToType: (
    te: TypeExprNode,
  ) => { kind: 'record' | 'union'; fields: import('../frontend/ast.js').RecordFieldNode[] } | undefined;
  /** Infers a type for an EA subexpression when possible; `undefined` if unknown. */
  resolveEaTypeExpr: (ea: EaExprNode) => TypeExprNode | undefined;
  /** Storage size in bytes; `undefined` if layout cannot be computed. */
  sizeOfTypeExpr: (te: TypeExprNode) => number | undefined;
};

/** Builds {@link EAResolutionContext} from emit-phase env/workspace plus type-resolution hooks. */
export function buildEaResolutionContext(params: {
  /** See {@link EAResolutionContext.env}. */
  env: CompileEnv;
  /** See {@link EAResolutionContext.diagnostics}. */
  diagnostics: Diagnostic[];
  /** See {@link EAResolutionContext.diagAt}. */
  diagAt: EAResolutionContext['diagAt'];
  /** See {@link EAResolutionContext.resolveScalarKind}. */
  resolveScalarKind: EAResolutionContext['resolveScalarKind'];
  /** See {@link EAResolutionContext.resolveAggregateType}. */
  resolveAggregateType: EAResolutionContext['resolveAggregateType'];
  /** See {@link EAResolutionContext.resolvePointedToType}. */
  resolvePointedToType: EAResolutionContext['resolvePointedToType'];
  /** See {@link EAResolutionContext.resolveEaTypeExpr}. */
  resolveEaTypeExpr: EAResolutionContext['resolveEaTypeExpr'];
  /** See {@link EAResolutionContext.evalImmNoDiag}. */
  evalImmNoDiag: EAResolutionContext['evalImmNoDiag'];
}): EAResolutionContext {
  const { env, diagnostics, diagAt } = params;
  return {
    env,
    diagnostics,
    diagAt,
    evalImmExpr: (expr) => evalImmExpr(expr, env, diagnostics),
    evalImmNoDiag: params.evalImmNoDiag,
    resolveScalarKind: params.resolveScalarKind,
    resolveAggregateType: params.resolveAggregateType,
    resolvePointedToType: params.resolvePointedToType,
    resolveEaTypeExpr: params.resolveEaTypeExpr,
    sizeOfTypeExpr: (te) => sizeOfTypeExpr(te, env, diagnostics),
  };
}

export function createEaResolutionHelpers(ctx: EAResolutionContext) {
  const layoutCastBaseMessage = (base: EaExprNode): string => {
    if (base.kind === 'EaName') {
      return `Invalid layout-cast base "${base.name}": expected a label or parenthesized label +/- imm form.`;
    }
    return 'Invalid layout-cast base: expected a label or parenthesized label +/- imm form.';
  };

  const hasKnownType = (typeExpr: TypeExprNode): boolean =>
    ctx.resolveScalarKind(typeExpr) !== undefined ||
    ctx.resolveAggregateType(typeExpr) !== undefined ||
    ctx.sizeOfTypeExpr(typeExpr) !== undefined;

  const resolveReinterpretBase = (
    expr: EaExprNode,
  ): { kind: 'runtime' } | { kind: 'invalid'; message: string } => {
    switch (expr.kind) {
      case 'EaName': {
        const upper = expr.name.toUpperCase();
        if (upper === 'HL' || upper === 'DE' || upper === 'BC' || upper === 'IX' || upper === 'IY') {
          return { kind: 'runtime' };
        }

          return { kind: 'invalid', message: layoutCastBaseMessage(expr) };
      }
      case 'EaAdd':
      case 'EaSub': {
        return resolveReinterpretBase(expr.base);
      }
      case 'EaImm':
        return { kind: 'invalid', message: layoutCastBaseMessage(expr) };
      default:
        return { kind: 'invalid', message: layoutCastBaseMessage(expr) };
    }
  };

  const resolveEa = (ea: EaExprNode, span: SourceSpan): EaResolution | undefined => {
    const go = (expr: EaExprNode, visitingAliases: Set<string>): EaResolution | undefined => {
      const layoutFold = foldLayoutCastAbsEa(expr, {
        env: ctx.env,
        evalImm: ctx.evalImmExpr,
        resolveAbsBase: (baseEa) => {
          const baseResolved = go(baseEa, visitingAliases);
          if (baseResolved?.kind !== 'abs') return undefined;
          return { baseLower: baseResolved.baseLower, addend: baseResolved.addend };
        },
        diagnostics: ctx.diagnostics,
      });
      if (layoutFold) {
        return { kind: 'abs', baseLower: layoutFold.baseLower, addend: layoutFold.addend };
      }

      switch (expr.kind) {
        case 'EaName': {
          const baseLower = expr.name.toLowerCase();
          const constValue = ctx.evalImmNoDiag({ kind: 'ImmName', span: expr.span, name: expr.name });
          if (constValue !== undefined) {
            return { kind: 'abs', baseLower: String(constValue), addend: 0 };
          }
          return { kind: 'abs', baseLower, addend: 0 };
        }
        case 'EaImm': {
          const value = ctx.evalImmNoDiag(expr.expr);
          if (value === undefined) return undefined;
          return { kind: 'abs', baseLower: String(value), addend: 0 };
        }
        case 'EaLayoutCast': {
          if (!hasKnownType(expr.typeExpr)) return undefined;
          if (isLayoutCastLabelBase(expr.base)) {
            const baseResolved = go(expr.base, visitingAliases);
            if (baseResolved?.kind === 'abs') {
              return { ...baseResolved, typeExpr: expr.typeExpr };
            }
            return undefined;
          }
          const base = resolveReinterpretBase(expr.base);
          if (base.kind === 'invalid') return undefined;
          if (base.kind === 'runtime') return undefined;
          return undefined;
        }
        case 'EaAdd':
        case 'EaSub': {
          const base = go(expr.base, visitingAliases);
          if (!base) return undefined;
          const v = ctx.evalImmNoDiag(expr.offset);
          if (v === undefined) return undefined;
          const delta = expr.kind === 'EaAdd' ? v : -v;
          if (base.kind === 'abs') return { ...base, addend: base.addend + delta };
          return undefined;
        }
        case 'EaField': {
          const base = go(expr.base, visitingAliases);
          if (!base) return undefined;
          if (!base.typeExpr) {
            ctx.diagAt(ctx.diagnostics, span, `Cannot resolve field "${expr.field}" without layout type information.`);
            return undefined;
          }
          const agg =
            ctx.resolveAggregateType(base.typeExpr) ?? ctx.resolvePointedToType(base.typeExpr);
          if (!agg) {
            ctx.diagAt(
              ctx.diagnostics,
              span,
              `Field access ".${expr.field}" requires a record or union type.`,
            );
            return undefined;
          }

          let off = 0;
          for (const f of agg.fields) {
            if (f.name === expr.field) {
              if (base.kind === 'abs') {
                return {
                  kind: 'abs',
                  baseLower: base.baseLower,
                  addend: base.addend + off,
                  typeExpr: f.typeExpr,
                };
              }
              return undefined;
            }
            if (agg.kind === 'record') {
              const sz = sizeOfTypeExpr(f.typeExpr, ctx.env, ctx.diagnostics);
              if (sz === undefined) return undefined;
              off += sz;
            }
          }
          const kind = agg.kind === 'union' ? 'union' : 'record';
          ctx.diagAt(ctx.diagnostics, span, `Unknown ${kind} field "${expr.field}".`);
          return undefined;
        }
        case 'EaIndex': {
          const base = go(expr.base, visitingAliases);
          if (!base) return undefined;
          if (!base.typeExpr) {
            ctx.diagAt(ctx.diagnostics, span, `Cannot resolve indexing without layout type information.`);
            return undefined;
          }
          if (base.typeExpr.kind !== 'ArrayType') {
            ctx.diagAt(ctx.diagnostics, span, `Indexing requires an array type.`);
            return undefined;
          }
          const elemSize = ctx.sizeOfTypeExpr(base.typeExpr.element);
          if (elemSize === undefined) return undefined;

          if (expr.index.kind === 'IndexImm') {
            const idx = ctx.evalImmExpr(expr.index.value);
            if (idx === undefined) return undefined;
            const delta = idx * elemSize;
            if (base.kind === 'abs') {
              return {
                kind: 'abs',
                baseLower: base.baseLower,
                addend: base.addend + delta,
                typeExpr: base.typeExpr.element,
              };
            }
            return undefined;
          }

          return undefined;
        }
      }
    };

    return go(ea, new Set<string>());
  };

  return {
    resolveEa,
  };
}
