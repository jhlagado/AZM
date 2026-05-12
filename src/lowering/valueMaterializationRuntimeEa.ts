import type { EaExprNode, ImmExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';

export type RuntimeComposedEaDeps = {
  pushEaAddress: (ea: EaExprNode, span: SourceSpan) => boolean;
  pushMemValue: (ea: EaExprNode, want: 'byte' | 'word', span: SourceSpan) => boolean;
  emitExactScaleInHl: (elemSize: number, span: SourceSpan) => boolean;
  fieldOffsetInBaseType: (baseType: TypeExprNode, fieldName: string, span: SourceSpan) => number | undefined;
  materializeRuntimeAddressBaseToHL: (base: EaExprNode, span: SourceSpan) => boolean;
  materializeResolvedAddressToHL: (resolved: EaResolution, span: SourceSpan) => boolean;
};

/**
 * When resolveEa returns nothing: runtime affine imm analysis, reinterpret/field/add-sub,
 * and typed array indexing with exact-size scaling. Orchestrated separately from resolved-address paths.
 */
export function createRuntimeComposedEaMaterialization(
  ctx: ValueMaterializationContext,
  deps: RuntimeComposedEaDeps,
) {
  const {
    pushEaAddress,
    pushMemValue,
    emitExactScaleInHl,
    fieldOffsetInBaseType,
    materializeRuntimeAddressBaseToHL,
    materializeResolvedAddressToHL,
  } = deps;

  type RuntimeLinear = {
    constTerm: number;
    atomName?: string;
    atomKind?: 'byte' | 'word' | 'addr';
    coeff: number;
  };
  const mkRuntimeLinear = (
    constTerm: number,
    coeff: number,
    atom?: { name: string; kind: 'byte' | 'word' | 'addr' },
  ): RuntimeLinear => (atom ? { constTerm, coeff, atomName: atom.name, atomKind: atom.kind } : { constTerm, coeff });
  const isPowerOfTwo = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;
  const combineRuntimeLinear = (
    left: RuntimeLinear | undefined,
    right: RuntimeLinear | undefined,
    op: '+' | '-',
  ): RuntimeLinear | undefined => {
    if (!left || !right) return undefined;
    const rightCoeff = op === '+' ? right.coeff : -right.coeff;
    const rightConst = op === '+' ? right.constTerm : -right.constTerm;
    if (!left.atomName && !right.atomName) return mkRuntimeLinear(left.constTerm + rightConst, 0);
    if (!left.atomName) {
      if (!right.atomName || !right.atomKind) return undefined;
      return mkRuntimeLinear(left.constTerm + rightConst, rightCoeff, {
        name: right.atomName,
        kind: right.atomKind,
      });
    }
    if (!right.atomName) {
      if (!left.atomKind) return undefined;
      return mkRuntimeLinear(left.constTerm + rightConst, left.coeff, {
        name: left.atomName,
        kind: left.atomKind,
      });
    }
    if (left.atomName !== right.atomName || !left.atomKind) return undefined;
    return mkRuntimeLinear(left.constTerm + rightConst, left.coeff + rightCoeff, {
      name: left.atomName,
      kind: left.atomKind,
    });
  };
  const runtimeLinearFromImm = (expr: ImmExprNode): RuntimeLinear | undefined => {
    const imm = ctx.evalImmNoDiag(expr);
    if (imm !== undefined) return mkRuntimeLinear(imm, 0);
    switch (expr.kind) {
      case 'ImmLiteral':
      case 'ImmSizeof':
      case 'ImmOffsetof':
        return mkRuntimeLinear(ctx.evalImmExpr(expr) ?? 0, 0);
      case 'ImmName': {
        const scalar = ctx.resolveScalarBinding(expr.name);
        if (!scalar) return undefined;
        return mkRuntimeLinear(0, 1, { name: expr.name, kind: scalar });
      }
      case 'ImmUnary': {
        const inner = runtimeLinearFromImm(expr.expr);
        if (!inner) return undefined;
        if (expr.op === '+') return inner;
        if (expr.op === '-') {
          return inner.atomName && inner.atomKind
            ? mkRuntimeLinear(-inner.constTerm, -inner.coeff, {
                name: inner.atomName,
                kind: inner.atomKind,
              })
            : mkRuntimeLinear(-inner.constTerm, -inner.coeff);
        }
        return undefined;
      }
      case 'ImmBinary': {
        const left = runtimeLinearFromImm(expr.left);
        const right = runtimeLinearFromImm(expr.right);
        if (!left || !right) return undefined;
        switch (expr.op) {
          case '+':
          case '-':
            return combineRuntimeLinear(left, right, expr.op);
          case '*': {
            const leftConstOnly = !left.atomName;
            const rightConstOnly = !right.atomName;
            if (leftConstOnly && rightConstOnly) return mkRuntimeLinear(left.constTerm * right.constTerm, 0);
            if (leftConstOnly && right.atomName) {
              if (!right.atomKind) return undefined;
              return mkRuntimeLinear(right.constTerm * left.constTerm, right.coeff * left.constTerm, {
                name: right.atomName,
                kind: right.atomKind,
              });
            }
            if (rightConstOnly && left.atomName) {
              if (!left.atomKind) return undefined;
              return mkRuntimeLinear(left.constTerm * right.constTerm, left.coeff * right.constTerm, {
                name: left.atomName,
                kind: left.atomKind,
              });
            }
            return undefined;
          }
          case '<<': {
            if (right.atomName) return undefined;
            const shift = right.constTerm;
            if (!Number.isInteger(shift) || shift < 0 || shift > 15) return undefined;
            const factor = 1 << shift;
            return left.atomName && left.atomKind
              ? mkRuntimeLinear(left.constTerm * factor, left.coeff * factor, {
                  name: left.atomName,
                  kind: left.atomKind,
                })
              : mkRuntimeLinear(left.constTerm * factor, left.coeff * factor);
          }
          default:
            return undefined;
        }
      }
    }
  };

  const materializeRuntimeImmExprToHl = (expr: ImmExprNode, context: string, span: SourceSpan): boolean => {
    const imm = ctx.evalImmExpr(expr);
    if (imm !== undefined) return ctx.loadImm16ToHL(imm & 0xffff, span);
    const linear = runtimeLinearFromImm(expr);
    if (!linear) {
      ctx.diagAt(
        ctx.diagnostics,
        span,
        `${context} is unsupported. Use a single scalar runtime atom with +, -, *, << and constants (no /, %, &, |, ^, >> on runtime atoms).`,
      );
      return false;
    }
    if (!linear.atomName || !linear.atomKind || linear.coeff === 0) {
      return ctx.loadImm16ToHL(linear.constTerm & 0xffff, span);
    }
    const coeffSign = linear.coeff < 0 ? -1 : 1;
    const coeffAbs = Math.abs(linear.coeff);
    if (!isPowerOfTwo(coeffAbs)) {
      ctx.diagAt(
        ctx.diagnostics,
        span,
        `${context} runtime multiplier must be a power-of-2; found ${linear.coeff}.`,
      );
      return false;
    }
    const atomEa: EaExprNode = { kind: 'EaName', span, name: linear.atomName };
    const want = linear.atomKind === 'byte' ? 'byte' : 'word';
    if (!pushMemValue(atomEa, want, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    const shiftCount = coeffAbs <= 1 ? 0 : Math.log2(coeffAbs);
    for (let i = 0; i < shiftCount; i++) {
      if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'HL' }], span))
        return false;
    }
    if (coeffSign < 0 && !ctx.negateHL(span)) return false;
    const addend = linear.constTerm & 0xffff;
    if (addend !== 0) {
      if (!ctx.loadImm16ToDE(addend, span)) return false;
      if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
        return false;
    }
    return true;
  };

  const pushRuntimeReinterpretAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (ea.kind !== 'EaReinterpret') return false;
    if (!materializeRuntimeAddressBaseToHL(ea.base, span)) return false;
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const pushRuntimeFieldAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (ea.kind !== 'EaField') return false;
    const baseType = ctx.resolveEaTypeExpr(ea.base);
    if (!baseType) {
      ctx.diagAt(ctx.diagnostics, span, `Cannot resolve field "${ea.field}" without a typed base.`);
      return false;
    }
    const fieldOffset = fieldOffsetInBaseType(baseType, ea.field, span);
    if (fieldOffset === undefined) return false;
    if (!pushEaAddress(ea.base, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (fieldOffset !== 0) {
      if (!ctx.loadImm16ToDE(fieldOffset & 0xffff, span)) return false;
      if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span)) {
        return false;
      }
    }
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const pushRuntimeAffineOffsetAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (ea.kind !== 'EaAdd' && ea.kind !== 'EaSub') return false;
    if (!pushEaAddress(ea.base, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (!materializeRuntimeImmExprToHl(ea.offset, 'Runtime EA offset expression', span)) return false;
    if (ea.kind === 'EaSub' && !ctx.negateHL(span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
      return false;
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const pushTypedRuntimeArrayElementAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (ea.kind !== 'EaIndex') return false;

    const baseType = ctx.resolveEaTypeExpr(ea.base);
    if (!baseType) {
      ctx.diagAt(ctx.diagnostics, span, `Cannot resolve indexing without a typed base.`);
      return false;
    }
    if (baseType.kind !== 'ArrayType') {
      const known =
        ctx.sizeOfTypeExpr(baseType) !== undefined ||
        ctx.resolveScalarKind(baseType) !== undefined ||
        ctx.resolveAggregateType(baseType) !== undefined;
      ctx.diagAt(
        ctx.diagnostics,
        span,
        known
          ? 'Indexing requires an array type.'
          : `Unknown reinterpret cast type "${baseType.kind === 'TypeName' ? baseType.name : 'type'}".`,
      );
      return false;
    }
    const elemSize = ctx.sizeOfTypeExpr(baseType.element);
    if (elemSize === undefined || !Number.isInteger(elemSize) || elemSize < 1) {
      ctx.diagAt(
        ctx.diagnostics,
        span,
        `Runtime indexing requires a positive exact element size (got ${elemSize}).`,
      );
      return false;
    }

    if (ea.index.kind === 'IndexMemHL') {
      ctx.emitRawCodeBytes(Uint8Array.of(0x7e), span.file, 'ld a, (hl)');
    }
    if (ea.index.kind === 'IndexMemIxIy') {
      const memExpr: EaExprNode =
        ea.index.disp === undefined
          ? { kind: 'EaName', span, name: ea.index.base }
          : { kind: 'EaAdd', span, base: { kind: 'EaName', span, name: ea.index.base }, offset: ea.index.disp };
      if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'A' }, { kind: 'Mem', span, expr: memExpr }], span))
        return false;
    }

    if (ea.index.kind === 'IndexImm') {
      if (!materializeRuntimeImmExprToHl(ea.index.value, 'Runtime array index expression', span)) return false;
    } else if (ea.index.kind === 'IndexEa') {
      const typeExpr = ctx.resolveEaTypeExpr(ea.index.expr);
      const scalar = typeExpr ? ctx.resolveScalarKind(typeExpr) : undefined;
      if (scalar === 'byte' || scalar === 'word' || scalar === 'addr') {
        const want = scalar === 'byte' ? 'byte' : 'word';
        if (!pushMemValue(ea.index.expr, want, span)) return false;
        if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
      } else {
        ctx.diagAt(ctx.diagnostics, span, `Nested index expression must resolve to scalar byte/word/addr value.`);
        return false;
      }
    } else if (ea.index.kind === 'IndexReg8') {
      const r8 = ea.index.reg.toUpperCase();
      if (!ctx.reg8.has(r8)) {
        ctx.diagAt(ctx.diagnostics, span, `Invalid reg8 index "${ea.index.reg}".`);
        return false;
      }
      if (
        !ctx.emitInstr(
          'ld',
          [{ kind: 'Reg', span, name: 'H' }, { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } }],
          span,
        )
      )
        return false;
      if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'L' }, { kind: 'Reg', span, name: r8 }], span))
        return false;
    } else if (ea.index.kind === 'IndexMemHL' || ea.index.kind === 'IndexMemIxIy') {
      if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'L' }, { kind: 'Reg', span, name: 'A' }], span))
        return false;
      if (
        !ctx.emitInstr(
          'ld',
          [{ kind: 'Reg', span, name: 'H' }, { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } }],
          span,
        )
      )
        return false;
    } else if (ea.index.kind === 'IndexReg16') {
      const r16 = ea.index.reg.toUpperCase();
      if (r16 !== 'HL') {
        if (r16 !== 'DE' && r16 !== 'BC') {
          ctx.diagAt(ctx.diagnostics, span, `Invalid reg16 index "${ea.index.reg}".`);
          return false;
        }
        const hi = r16 === 'DE' ? 'D' : 'B';
        const lo = r16 === 'DE' ? 'E' : 'C';
        if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'H' }, { kind: 'Reg', span, name: hi }], span))
          return false;
        if (!ctx.emitInstr('ld', [{ kind: 'Reg', span, name: 'L' }, { kind: 'Reg', span, name: lo }], span))
          return false;
      }
    } else {
      ctx.diagAt(ctx.diagnostics, span, `Non-constant array indices are not supported yet.`);
      return false;
    }

    if (!emitExactScaleInHl(elemSize, span)) return false;
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;

    const baseResolved = ctx.resolveEa(ea.base, span);
    if (baseResolved) {
      if (!materializeResolvedAddressToHL(baseResolved, span)) return false;
    } else {
      if (!pushEaAddress(ea.base, span)) return false;
      if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    }

    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!ctx.emitInstr('add', [{ kind: 'Reg', span, name: 'HL' }, { kind: 'Reg', span, name: 'DE' }], span))
      return false;
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const pushUnresolvedComposedEaAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (pushRuntimeReinterpretAddress(ea, span)) return true;
    if (pushRuntimeFieldAddress(ea, span)) return true;
    if (ea.kind !== 'EaIndex' && ea.kind !== 'EaAdd' && ea.kind !== 'EaSub') return false;
    if (pushRuntimeAffineOffsetAddress(ea, span)) return true;
    return pushTypedRuntimeArrayElementAddress(ea, span);
  };

  return { pushUnresolvedComposedEaAddress };
}
