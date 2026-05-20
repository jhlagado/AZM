import type { AsmOperandNode, EaExprNode, ImmExprNode, OffsetofPathNode } from '../frontend/ast.js';

type AsmUtilsContext = {
  /** Returns true when `name` matches a declared enum (used to normalize asm tokens); callback must stay pure. */
  isEnumName: (name: string) => boolean;
};

function cloneOffsetofPath(path: OffsetofPathNode): OffsetofPathNode {
  return {
    ...path,
    steps: path.steps.map((step) =>
      step.kind === 'OffsetofIndex' ? { ...step, expr: cloneImmExpr(step.expr) } : { ...step },
    ),
  };
}

export function cloneImmExpr(expr: ImmExprNode): ImmExprNode {
  if (expr.kind === 'ImmLiteral') return { ...expr };
  if (expr.kind === 'ImmCurrentLocation') return { ...expr };
  if (expr.kind === 'ImmName') return { ...expr };
  if (expr.kind === 'ImmSizeof') return { ...expr };
  if (expr.kind === 'ImmOffsetof') return { ...expr, path: cloneOffsetofPath(expr.path) };
  if (expr.kind === 'ImmUnary') return { ...expr, expr: cloneImmExpr(expr.expr) };
  return { ...expr, left: cloneImmExpr(expr.left), right: cloneImmExpr(expr.right) };
}

export function cloneEaExpr(ea: EaExprNode): EaExprNode {
  switch (ea.kind) {
    case 'EaName':
      return { ...ea };
    case 'EaImm':
      return { ...ea, expr: cloneImmExpr(ea.expr) };
    case 'EaLayoutCast':
      return { ...ea, base: cloneEaExpr(ea.base) };
    case 'EaField':
      return { ...ea, base: cloneEaExpr(ea.base) };
    case 'EaIndex':
      return {
        ...ea,
        base: cloneEaExpr(ea.base),
        index:
          ea.index.kind === 'IndexEa'
            ? { ...ea.index, expr: cloneEaExpr(ea.index.expr) }
            : ea.index.kind === 'IndexImm'
              ? { ...ea.index, value: cloneImmExpr(ea.index.value) }
              : ea.index.kind === 'IndexMemIxIy' && ea.index.disp
                ? { ...ea.index, disp: cloneImmExpr(ea.index.disp) }
                : { ...ea.index },
      };
    case 'EaAdd':
    case 'EaSub':
      return { ...ea, base: cloneEaExpr(ea.base), offset: cloneImmExpr(ea.offset) };
  }
}

export function cloneOperand(op: AsmOperandNode): AsmOperandNode {
  switch (op.kind) {
    case 'Reg':
    case 'PortC':
      return { ...op };
    case 'Imm':
    case 'PortImm8':
      return { ...op, expr: cloneImmExpr(op.expr) } as AsmOperandNode;
    case 'Ea':
    case 'Mem':
      return { ...op, expr: cloneEaExpr(op.expr) } as AsmOperandNode;
  }
}

export function flattenEaDottedName(ea: EaExprNode): string | undefined {
  if (ea.kind === 'EaName') return ea.name;
  if (ea.kind === 'EaImm') return undefined;
  if (ea.kind === 'EaLayoutCast') return undefined;
  if (ea.kind === 'EaField') {
    const base = flattenEaDottedName(ea.base);
    return base ? `${base}.${ea.field}` : undefined;
  }
  return undefined;
}

export function createAsmUtilityHelpers(ctx: AsmUtilsContext) {
  const enumImmExprFromOperand = (op: AsmOperandNode): ImmExprNode | undefined => {
    if (op.kind === 'Imm') return op.expr;
    if (op.kind !== 'Ea') return undefined;
    const name = flattenEaDottedName(op.expr);
    if (!name || !ctx.isEnumName(name)) return undefined;
    return { kind: 'ImmName', span: op.span, name };
  };

  const normalizeFixedToken = (op: AsmOperandNode): string | undefined => {
    switch (op.kind) {
      case 'Reg':
        return op.name.toUpperCase();
      case 'Imm':
        if (op.expr.kind === 'ImmName') return op.expr.name.toUpperCase();
        return undefined;
      case 'Ea': {
        const enumExpr = enumImmExprFromOperand(op);
        return enumExpr?.kind === 'ImmName' ? enumExpr.name.toUpperCase() : undefined;
      }
      default:
        return undefined;
    }
  };

  return {
    normalizeFixedToken,
  };
}
