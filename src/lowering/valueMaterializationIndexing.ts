import type { EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';

/** Compile-time analysis: how many ADD HL,HL shifts implement multiply by exact element size (power of two). */
export function pow2ShiftCountForElementSize(elemSize: number | undefined): number | undefined {
  if (elemSize === undefined || !Number.isInteger(elemSize) || elemSize < 1) return undefined;
  let n = elemSize;
  let shiftCount = 0;
  while (n > 1 && (n & 1) === 0) {
    n >>= 1;
    shiftCount++;
  }
  if (n !== 1 || shiftCount > 15) return undefined;
  return shiftCount;
}

/**
 * Execution: HL := HL * elemSize using exact-size rules (shift chain or shift/add decomposition).
 */
export function createExactSizeIndexScaling(ctx: ValueMaterializationContext) {
  const emitExactScaleInHl = (elemSize: number, span: SourceSpan): boolean => {
    const shiftCount = pow2ShiftCountForElementSize(elemSize);
    if (shiftCount !== undefined) {
      for (let i = 0; i < shiftCount; i++) {
        if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'HL' }], span))
          return false;
      }
      return true;
    }

    if (!Number.isInteger(elemSize) || elemSize < 1) {
      ctx.diagAt(ctx.diagnostics, span, `Runtime indexing requires a positive exact element size (got ${elemSize}).`);
      return false;
    }
    if (elemSize === 1) return true;
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'D' }, { kind: 'Reg', span, name: 'H' }], span))
      return false;
    if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'E' }, { kind: 'Reg', span, name: 'L' }], span))
      return false;
    for (const bit of elemSize.toString(2).slice(1)) {
      if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'HL' }], span))
        return false;
      if (bit === '1') {
        if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
          return false;
      }
    }
    return ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span);
  };

  return { emitExactScaleInHl };
}

/**
 * Reg8/reg16 typed array index when the full EA does not resolve: load index into HL, scale, add base, push.
 * Returns null if this family does not apply; otherwise the boolean success of the path.
 */
export function tryPushRegIndexedArrayAddressWhenUnresolvedEa(
  ctx: ValueMaterializationContext,
  ea: EaExprNode,
  span: SourceSpan,
  emitExactScaleInHl: (elemSize: number, span: SourceSpan) => boolean,
): boolean | null {
  if (ctx.resolveEa(ea, span)) return null;
  if (ea.kind !== 'EaIndex') return null;
  if (ea.index.kind !== 'IndexReg8' && ea.index.kind !== 'IndexReg16') return null;

  const baseResolved = ctx.resolveEa(ea.base, span);
  const baseType = ctx.resolveEaTypeExpr(ea.base);
  if (!baseResolved || !baseType || baseType.kind !== 'ArrayType') return null;
  const elemSize = ctx.sizeOfTypeExpr(baseType.element);
  if (elemSize === undefined || !Number.isInteger(elemSize) || elemSize < 1) return null;

  const loadIndexToHL = (): boolean => {
    const index = ea.index;
    if (index.kind === 'IndexReg16') {
      const r16 = index.reg.toUpperCase();
      if (r16 === 'HL') return true;
      if (r16 === 'DE' || r16 === 'BC') {
        const hi = r16 === 'DE' ? 'D' : 'B';
        const lo = r16 === 'DE' ? 'E' : 'C';
        return (
          ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'H' }, { kind: 'Reg', span, name: hi }], span) &&
          ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'L' }, { kind: 'Reg', span, name: lo }], span)
        );
      }
      ctx.diagAt(ctx.diagnostics, span, `Invalid reg16 index "${index.reg}".`);
      return false;
    }
    if (index.kind !== 'IndexReg8') return false;
    const r8 = index.reg.toUpperCase();
    if (!ctx.reg8.has(r8)) {
      ctx.diagAt(ctx.diagnostics, span, `Invalid reg8 index "${index.reg}".`);
      return false;
    }
    return (
      ctx.emitInstr(
        'ld',
        [{ kind: 'Reg', span, name: 'H' }, { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } }],
        span,
      ) && ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'L' }, { kind: 'Reg', span, name: r8 }], span)
    );
  };

  if (!loadIndexToHL()) return false;
  if (!emitExactScaleInHl(elemSize, span)) return false;

  if (baseResolved.kind === 'abs') {
    ctx.emitAbs16Fixup(0x11, baseResolved.baseLower, baseResolved.addend, span);
    if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
      return false;
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  }

  if (!ctx.emitInstr('ex', [{ kind: 'Reg', span, name: 'DE' }, { kind: 'Reg', span, name: 'HL' }], span))
    return false;
  if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
  if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'IX' }], span)) return false;
  if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
  if (baseResolved.ixDisp !== 0) {
    if (!ctx.loadImm16ToDE(baseResolved.ixDisp, span)) return false;
    if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
      return false;
  }
  if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
  if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
    return false;
  return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
}
