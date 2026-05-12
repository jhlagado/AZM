import type { AsmOperandNode, EaExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';

/**
 * Reinterpret-cast base materialization, resolved EA → HL, and record/union field offsets.
 * Separates “what address does this base denote?” from affine/index orchestration.
 */
export function createRuntimeAddressBaseMaterialization(ctx: ValueMaterializationContext) {
  const reinterpretBaseMessage = (base: EaExprNode): string => {
    if (base.kind === 'EaName') {
      return `Invalid reinterpret base "${base.name}": expected HL/DE/BC/IX/IY, a scalar word/addr name, or a parenthesized base +/- imm form built from one of those.`;
    }
    return 'Invalid reinterpret base: expected HL/DE/BC/IX/IY, a scalar word/addr name, or a parenthesized base +/- imm form built from one of those.';
  };

  const ixDispMemExpr = (disp: number, span: SourceSpan): EaExprNode =>
    disp === 0
      ? { kind: 'EaName', span, name: 'IX' }
      : {
          kind: disp >= 0 ? 'EaAdd' : 'EaSub',
          span,
          base: { kind: 'EaName', span, name: 'IX' },
          offset: { kind: 'ImmLiteral', span, value: Math.abs(disp) },
        };

  const ixDispMemOperand = (disp: number, span: SourceSpan): AsmOperandNode => ({
    kind: 'Mem',
    span,
    expr: ixDispMemExpr(disp, span),
  });

  const materializeRuntimeAddressBaseToHL = (base: EaExprNode, span: SourceSpan): boolean => {
    switch (base.kind) {
      case 'EaName': {
        const upper = base.name.toUpperCase();
        if (upper === 'HL') return true;
        if (upper === 'DE' || upper === 'BC') {
          const hi = upper === 'DE' ? 'D' : 'B';
          const lo = upper === 'DE' ? 'E' : 'C';
          return (
            ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'H' }, { kind: 'Reg', span, name: hi }], span) &&
            ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'L' }, { kind: 'Reg', span, name: lo }], span)
          );
        }
        if (upper === 'IX' || upper === 'IY') {
          return (
            ctx.emitInstr('push', [{ kind: 'Reg', span, name: upper }], span) &&
            ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)
          );
        }

        const scalar = ctx.resolveScalarBinding(base.name);
        if (scalar === 'word' || scalar === 'addr') {
          const resolved = ctx.resolveEa(base, span);
          if (ctx.emitScalarWordLoad('HL', resolved, span)) return true;
          if (resolved?.kind === 'abs') {
            ctx.emitAbs16Fixup(0x2a, resolved.baseLower, resolved.addend, span);
            return true;
          }
        }

        ctx.diagAt(ctx.diagnostics, span, reinterpretBaseMessage(base));
        return false;
      }
      case 'EaAdd':
      case 'EaSub': {
        if (!materializeRuntimeAddressBaseToHL(base.base, span)) return false;
        const delta = ctx.evalImmExpr(base.offset);
        if (delta === undefined) return false;
        const addend = (base.kind === 'EaAdd' ? delta : -delta) & 0xffff;
        if (addend === 0) return true;
        if (!ctx.loadImm16ToDE(addend, span)) return false;
        return ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span);
      }
      default:
        ctx.diagAt(ctx.diagnostics, span, reinterpretBaseMessage(base));
        return false;
    }
  };

  const fieldOffsetInBaseType = (
    baseType: TypeExprNode,
    fieldName: string,
    span: SourceSpan,
  ): number | undefined => {
    const agg = ctx.resolveAggregateType(baseType);
    if (!agg) {
      const known = ctx.sizeOfTypeExpr(baseType) !== undefined || ctx.resolveScalarKind(baseType) !== undefined;
      ctx.diagAt(
        ctx.diagnostics,
        span,
        known
          ? `Field access ".${fieldName}" requires a record or union type.`
          : `Unknown reinterpret cast type "${baseType.kind === 'TypeName' ? baseType.name : 'type'}".`,
      );
      return undefined;
    }

    let offset = 0;
    for (const field of agg.fields) {
      if (field.name === fieldName) return offset;
      if (agg.kind === 'record') {
        const fieldSize = ctx.sizeOfTypeExpr(field.typeExpr);
        if (fieldSize === undefined) return undefined;
        offset += fieldSize;
      }
    }

    ctx.diagAt(
      ctx.diagnostics,
      span,
      `${agg.kind === 'union' ? 'Unknown union field' : 'Unknown record field'} "${fieldName}".`,
    );
    return undefined;
  };

  const materializeResolvedAddressToHL = (resolved: EaResolution, span: SourceSpan): boolean => {
    if (resolved.kind === 'abs') {
      ctx.emitAbs16Fixup(0x21, resolved.baseLower, resolved.addend, span);
      return true;
    }

    if (resolved.kind === 'stack') {
      if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'IX' }], span)) return false;
      if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
      if (resolved.ixDisp !== 0) {
        if (!ctx.loadImm16ToDE(resolved.ixDisp & 0xffff, span)) return false;
        if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
          return false;
      }
      return true;
    }

    if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'E' }, ixDispMemOperand(resolved.ixDisp, span)], span)) {
      return false;
    }
    if (
      !ctx.emitInstr(
        'ld',
        [{ kind: 'Reg', span, name: 'D' }, ixDispMemOperand(resolved.ixDisp + 1, span)],
        span,
      )
    ) {
      return false;
    }
    if (!ctx.emitInstr('ex', [{ kind: 'Reg', span, name: 'DE' }, { kind: 'Reg', span, name: 'HL' }], span))
      return false;
    if (resolved.addend !== 0) {
      if (!ctx.loadImm16ToDE(resolved.addend & 0xffff, span)) return false;
      if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
        return false;
    }
    return true;
  };

  return {
    fieldOffsetInBaseType,
    materializeResolvedAddressToHL,
    materializeRuntimeAddressBaseToHL,
  };
}
