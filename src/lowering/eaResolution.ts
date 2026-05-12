import type { Diagnostic } from '../diagnosticTypes.js';
import type { EaExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import { evalImmExpr, type CompileEnv } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';

export type EaResolution =
  | {
      /** Resolved global/absolute label or numeric base. */
      kind: 'abs';
      /** Lowercased symbol name or stringified numeric base for fixups. */
      baseLower: string;
      /** Byte offset added to the base symbol. */
      addend: number;
      /** Optional inferred type at this address; omit when unknown. */
      typeExpr?: TypeExprNode;
    }
  | {
      /** IX/IY-relative stack or direct stack slot. */
      kind: 'stack';
      /** Displacement in bytes from the frame base register. */
      ixDisp: number;
      /** Optional slot/aggregate type when known. */
      typeExpr?: TypeExprNode;
    }
  | {
      /** Stack slot holds an address; access is indirect with offset. */
      kind: 'indirect';
      /** Frame displacement of the pointer slot. */
      ixDisp: number;
      /** Byte offset applied after loading the pointer. */
      addend: number;
      /** Optional pointee type when known. */
      typeExpr?: TypeExprNode;
    };

/** Maps, env, and type hooks used by {@link createEaResolutionHelpers} — not the full function-lowering context. */
export type EAResolutionContext = {
  /** Compile-time const/enum/type environment for imm evaluation. */
  env: CompileEnv;
  /** Mutable diagnostic list for resolution errors. */
  diagnostics: Diagnostic[];
  /** Appends a span-attached diagnostic. */
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  /** Lowercased stack slot name → IX/IY displacement (bytes). */
  stackSlotOffsets: Map<string, number>;
  /** Lowercased stack slot name → declared slot type, when known. */
  stackSlotTypes: Map<string, TypeExprNode>;
  /** Lowercased symbol → global/storage type expression. */
  storageTypes: Map<string, TypeExprNode>;
  /** Cross-module alias name → target EA expression. */
  moduleAliasTargets: Map<string, EaExprNode>;
  /** Current function’s local alias map (fresh each function). */
  getLocalAliasTargets: () => Map<string, EaExprNode>;
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

/** Storage slice fields that feed EA resolution (`EmitPhase1Workspace.storage` plus the same keys). */
export type EaResolutionWorkspaceSlice = {
  /** See {@link EAResolutionContext.stackSlotOffsets}. */
  stackSlotOffsets: Map<string, number>;
  /** See {@link EAResolutionContext.stackSlotTypes}. */
  stackSlotTypes: Map<string, TypeExprNode>;
  /** See {@link EAResolutionContext.storageTypes}. */
  storageTypes: Map<string, TypeExprNode>;
  /** See {@link EAResolutionContext.moduleAliasTargets}. */
  moduleAliasTargets: Map<string, EaExprNode>;
  /** Snapshot of local aliases (not a getter); paired with `getLocalAliasTargets` in builders. */
  localAliasTargets: Map<string, EaExprNode>;
};

/** Builds {@link EAResolutionContext} from emit-phase env/workspace plus type-resolution hooks. */
export function buildEaResolutionContext(params: {
  /** See {@link EAResolutionContext.env}. */
  env: CompileEnv;
  /** See {@link EAResolutionContext.diagnostics}. */
  diagnostics: Diagnostic[];
  /** See {@link EAResolutionContext.diagAt}. */
  diagAt: EAResolutionContext['diagAt'];
  /** Workspace maps aliasing the fields on {@link EAResolutionContext}. */
  workspace: EaResolutionWorkspaceSlice;
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
  const { env, diagnostics, diagAt, workspace } = params;
  return {
    env,
    diagnostics,
    diagAt,
    stackSlotOffsets: workspace.stackSlotOffsets,
    stackSlotTypes: workspace.stackSlotTypes,
    storageTypes: workspace.storageTypes,
    moduleAliasTargets: workspace.moduleAliasTargets,
    getLocalAliasTargets: () => workspace.localAliasTargets,
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
  const resolveAliasTarget = (nameLower: string): EaExprNode | undefined =>
    ctx.getLocalAliasTargets().get(nameLower) ?? ctx.moduleAliasTargets.get(nameLower);

  const reinterpretBaseMessage = (base: EaExprNode): string => {
    if (base.kind === 'EaName') {
      return `Invalid reinterpret base "${base.name}": expected HL/DE/BC/IX/IY, a scalar word/addr name, or a parenthesized base +/- imm form built from one of those.`;
    }
    return 'Invalid reinterpret base: expected HL/DE/BC/IX/IY, a scalar word/addr name, or a parenthesized base +/- imm form built from one of those.';
  };

  const hasKnownType = (typeExpr: TypeExprNode): boolean =>
    ctx.resolveScalarKind(typeExpr) !== undefined ||
    ctx.resolveAggregateType(typeExpr) !== undefined ||
    ctx.sizeOfTypeExpr(typeExpr) !== undefined;

  const resolveReinterpretStackBase = (
    expr: EaExprNode,
  ): { kind: 'indirect'; ixDisp: number; addend: number } | { kind: 'runtime' } | { kind: 'invalid'; message: string } => {
    switch (expr.kind) {
      case 'EaName': {
        const upper = expr.name.toUpperCase();
        if (upper === 'HL' || upper === 'DE' || upper === 'BC' || upper === 'IX' || upper === 'IY') {
          return { kind: 'runtime' };
        }

        const lower = expr.name.toLowerCase();
        const slotOff = ctx.stackSlotOffsets.get(lower);
        if (slotOff !== undefined) {
          const slotType = ctx.stackSlotTypes.get(lower);
          const scalar = slotType ? ctx.resolveScalarKind(slotType) : undefined;
          if (scalar === 'word' || scalar === 'addr') {
            return { kind: 'indirect', ixDisp: slotOff, addend: 0 };
          }
          if (slotType && ctx.resolveAggregateType(slotType)) {
            return { kind: 'indirect', ixDisp: slotOff, addend: 0 };
          }
          return { kind: 'invalid', message: reinterpretBaseMessage(expr) };
        }

        const storageType = ctx.storageTypes.get(lower);
        if (storageType) {
          const scalar = ctx.resolveScalarKind(storageType);
          if (scalar === 'word' || scalar === 'addr') return { kind: 'runtime' };
          return { kind: 'invalid', message: reinterpretBaseMessage(expr) };
        }

        if (resolveAliasTarget(lower)) return { kind: 'runtime' };
        return { kind: 'invalid', message: reinterpretBaseMessage(expr) };
      }
      case 'EaAdd':
      case 'EaSub': {
        const base = resolveReinterpretStackBase(expr.base);
        if (base.kind !== 'indirect') return base;
        const delta = ctx.evalImmNoDiag(expr.offset);
        if (delta === undefined) {
          return { kind: 'invalid', message: reinterpretBaseMessage(expr.base) };
        }
        return {
          kind: 'indirect',
          ixDisp: base.ixDisp,
          addend: base.addend + (expr.kind === 'EaAdd' ? delta : -delta),
        };
      }
      case 'EaImm':
        return { kind: 'invalid', message: reinterpretBaseMessage(expr) };
      default:
        return { kind: 'invalid', message: reinterpretBaseMessage(expr) };
    }
  };

  const resolveEa = (ea: EaExprNode, span: SourceSpan): EaResolution | undefined => {
    const go = (expr: EaExprNode, visitingAliases: Set<string>): EaResolution | undefined => {
      switch (expr.kind) {
        case 'EaName': {
          const baseLower = expr.name.toLowerCase();
          const slotOff = ctx.stackSlotOffsets.get(baseLower);
          if (slotOff !== undefined) {
            const slotType = ctx.stackSlotTypes.get(baseLower);
            const scalarKind = slotType ? ctx.resolveScalarKind(slotType) : undefined;
            if (slotType && scalarKind === undefined) {
              const agg = ctx.resolveAggregateType(slotType);
              if (agg) {
                return {
                  kind: 'stack',
                  ixDisp: slotOff,
                  typeExpr: slotType,
                };
              }
              return {
                kind: 'indirect',
                ixDisp: slotOff,
                addend: 0,
                typeExpr: slotType,
              };
            }
            return {
              kind: 'stack',
              ixDisp: slotOff,
              ...(slotType ? { typeExpr: slotType } : {}),
            };
          }
          const aliasTarget = resolveAliasTarget(baseLower);
          if (aliasTarget) {
            if (visitingAliases.has(baseLower)) return undefined;
            visitingAliases.add(baseLower);
            try {
              return go(aliasTarget, visitingAliases);
            } finally {
              visitingAliases.delete(baseLower);
            }
          }
          const typeExpr = ctx.storageTypes.get(baseLower);
          if (typeExpr) return { kind: 'abs', baseLower, addend: 0, typeExpr };
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
        case 'EaReinterpret': {
          if (!hasKnownType(expr.typeExpr)) return undefined;
          const base = resolveReinterpretStackBase(expr.base);
          if (base.kind === 'invalid') return undefined;
          if (base.kind === 'runtime') return undefined;
          return {
            kind: 'indirect',
            ixDisp: base.ixDisp,
            addend: base.addend,
            typeExpr: expr.typeExpr,
          };
        }
        case 'EaAdd':
        case 'EaSub': {
          const base = go(expr.base, visitingAliases);
          if (!base) return undefined;
          const v = ctx.evalImmNoDiag(expr.offset);
          if (v === undefined) return undefined;
          const delta = expr.kind === 'EaAdd' ? v : -v;
          if (
            base.kind === 'stack' &&
            base.typeExpr &&
            (ctx.resolveAggregateType(base.typeExpr) || ctx.resolvePointedToType(base.typeExpr))
          ) {
            if (delta === 0) return base;
            return {
              kind: 'indirect',
              ixDisp: base.ixDisp,
              addend: delta,
              typeExpr: base.typeExpr,
            };
          }
          if (base.kind === 'abs') return { ...base, addend: base.addend + delta };
          if (base.kind === 'indirect') return { ...base, addend: base.addend + delta };
          return { ...base, ixDisp: base.ixDisp + delta };
        }
        case 'EaField': {
          const base = go(expr.base, visitingAliases);
          if (!base) return undefined;
          if (!base.typeExpr) {
            ctx.diagAt(ctx.diagnostics, span, `Cannot resolve field "${expr.field}" without a typed base.`);
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
              if (base.kind === 'indirect') {
                return {
                  kind: 'indirect',
                  ixDisp: base.ixDisp,
                  addend: base.addend + off,
                  typeExpr: f.typeExpr,
                };
              }
              if (
                base.kind === 'stack' &&
                base.typeExpr &&
                (ctx.resolveAggregateType(base.typeExpr) || ctx.resolvePointedToType(base.typeExpr))
              ) {
                return {
                  kind: 'indirect',
                  ixDisp: base.ixDisp,
                  addend: off,
                  typeExpr: f.typeExpr,
                };
              }
              return {
                kind: 'stack',
                ixDisp: base.ixDisp + off,
                typeExpr: f.typeExpr,
              };
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
            ctx.diagAt(ctx.diagnostics, span, `Cannot resolve indexing without a typed base.`);
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
            if (base.kind === 'indirect') {
              return {
                kind: 'indirect',
                ixDisp: base.ixDisp,
                addend: base.addend + delta,
                typeExpr: base.typeExpr.element,
              };
            }
            return {
              kind: 'stack',
              ixDisp: base.ixDisp + delta,
              typeExpr: base.typeExpr.element,
            };
          }

          return undefined;
        }
      }
    };

    return go(ea, new Set<string>());
  };

  return {
    resolveAliasTarget,
    resolveEa,
  };
}
