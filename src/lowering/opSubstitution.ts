import type {
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  OffsetofPathNode,
  OffsetofPathStepNode,
  SourceSpan,
} from '../frontend/ast.js';
import type {
  AstCloneCapability,
  CompileEnvCapability,
  DottedEaNameCapability,
  FixedTokenNormalizationCapability,
  InverseConditionCapability,
  LoweringDiagnosticsCapability,
} from './capabilities.js';

type OpSubstitutionContext = LoweringDiagnosticsCapability &
  CompileEnvCapability &
  AstCloneCapability &
  DottedEaNameCapability &
  FixedTokenNormalizationCapability &
  InverseConditionCapability & {
  bindings: Map<string, AsmOperandNode>;
};

export function createOpSubstitutionHelpers(ctx: OpSubstitutionContext) {
  const substituteOffsetofPath = (
    path: OffsetofPathNode,
    substituteImmExpr: (expr: ImmExprNode) => ImmExprNode,
  ): OffsetofPathNode => ({
    ...path,
    steps: path.steps.map((step): OffsetofPathStepNode =>
      step.kind === 'OffsetofIndex'
        ? { ...step, expr: substituteImmExpr(step.expr) }
        : { ...step },
    ),
  });

  const bindingAsImmExpr = (
    bound: AsmOperandNode | undefined,
    span: SourceSpan,
  ): ImmExprNode | undefined => {
    if (!bound) return undefined;
    if (bound.kind === 'Imm') return ctx.cloneImmExpr(bound.expr);
    if (bound.kind !== 'Ea') return undefined;
    const name = ctx.flattenEaDottedName(bound.expr);
    if (!name || !ctx.env.enums.has(name)) return undefined;
    return { kind: 'ImmName', span, name };
  };

  const substituteImm = (expr: ImmExprNode): ImmExprNode => {
    if (expr.kind === 'ImmName') {
      const bound = ctx.bindings.get(expr.name.toLowerCase());
      const immBound = bindingAsImmExpr(bound, expr.span);
      if (immBound) return immBound;
      return { ...expr };
    }
    if (expr.kind === 'ImmOffsetof') {
      return { ...expr, path: substituteOffsetofPath(expr.path, substituteImm) };
    }
    if (expr.kind === 'ImmUnary') return { ...expr, expr: substituteImm(expr.expr) };
    if (expr.kind === 'ImmBinary') {
      return {
        ...expr,
        left: substituteImm(expr.left),
        right: substituteImm(expr.right),
      };
    }
    return { ...expr };
  };

  const substituteOperand = (operand: AsmOperandNode): AsmOperandNode => {
    if (operand.kind === 'Imm' && operand.expr.kind === 'ImmName') {
      const bound = ctx.bindings.get(operand.expr.name.toLowerCase());
      const immBound = bindingAsImmExpr(bound, operand.span);
      if (immBound) return { kind: 'Imm', span: operand.span, expr: immBound };
      if (bound) return ctx.cloneOperand(bound);
      return { ...operand, expr: substituteImm(operand.expr) };
    }
    if (operand.kind === 'Imm') return { ...operand, expr: substituteImm(operand.expr) };
    if (operand.kind === 'PortImm8') {
      return { ...operand, expr: substituteImm(operand.expr) };
    }
    if ((operand.kind === 'Ea' || operand.kind === 'Mem') && operand.expr.kind === 'EaName') {
      const bound = ctx.bindings.get(operand.expr.name.toLowerCase());
      if (bound?.kind === 'Ea') return ctx.cloneOperand(bound);
      if (bound?.kind === 'Reg') {
        return {
          ...operand,
          expr: { kind: 'EaName', span: operand.expr.span, name: bound.name },
        };
      }
      if (bound?.kind === 'Imm' && bound.expr.kind === 'ImmName') {
        return {
          ...operand,
          expr: { kind: 'EaName', span: operand.expr.span, name: bound.expr.name },
        };
      }
      return ctx.cloneOperand(operand);
    }
    return ctx.cloneOperand(operand);
  };

  const substituteImmWithOpLabels = (
    expr: ImmExprNode,
    localLabelMap: Map<string, string>,
  ): ImmExprNode => {
    if (expr.kind === 'ImmName') {
      const bound = ctx.bindings.get(expr.name.toLowerCase());
      const immBound = bindingAsImmExpr(bound, expr.span);
      if (immBound) return immBound;
      const mapped = localLabelMap.get(expr.name.toLowerCase());
      if (mapped) return { kind: 'ImmName', span: expr.span, name: mapped };
      return { ...expr };
    }
    if (expr.kind === 'ImmOffsetof') {
      return {
        ...expr,
        path: substituteOffsetofPath(expr.path, (inner) =>
          substituteImmWithOpLabels(inner, localLabelMap),
        ),
      };
    }
    if (expr.kind === 'ImmUnary') {
      return { ...expr, expr: substituteImmWithOpLabels(expr.expr, localLabelMap) };
    }
    if (expr.kind === 'ImmBinary') {
      return {
        ...expr,
        left: substituteImmWithOpLabels(expr.left, localLabelMap),
        right: substituteImmWithOpLabels(expr.right, localLabelMap),
      };
    }
    return { ...expr };
  };

  const substituteOperandWithOpLabels = (
    operand: AsmOperandNode,
    localLabelMap: Map<string, string>,
  ): AsmOperandNode => {
    const substituteEaWithOpLabels = (ea: EaExprNode): EaExprNode => {
      if (ea.kind === 'EaName') {
        const bound = ctx.bindings.get(ea.name.toLowerCase());
        if (bound?.kind === 'Ea') return ctx.cloneEaExpr(bound.expr);
        if (bound?.kind === 'Reg') {
          return { kind: 'EaName', span: ea.span, name: bound.name };
        }
        if (bound?.kind === 'Imm' && bound.expr.kind === 'ImmName') {
          return { kind: 'EaName', span: ea.span, name: bound.expr.name };
        }
        const mapped = localLabelMap.get(ea.name.toLowerCase());
        if (mapped) return { kind: 'EaName', span: ea.span, name: mapped };
        return { ...ea };
      }
      if (ea.kind === 'EaImm') {
        return { ...ea, expr: substituteImmWithOpLabels(ea.expr, localLabelMap) };
      }
      if (ea.kind === 'EaField') {
        return { ...ea, base: substituteEaWithOpLabels(ea.base) };
      }
      if (ea.kind === 'EaIndex') {
        const index =
          ea.index.kind === 'IndexEa'
            ? { ...ea.index, expr: substituteEaWithOpLabels(ea.index.expr) }
            : ea.index.kind === 'IndexImm'
              ? { ...ea.index, value: substituteImmWithOpLabels(ea.index.value, localLabelMap) }
              : ea.index.kind === 'IndexMemIxIy' && ea.index.disp
                ? { ...ea.index, disp: substituteImmWithOpLabels(ea.index.disp, localLabelMap) }
                : { ...ea.index };
        return { ...ea, base: substituteEaWithOpLabels(ea.base), index };
      }
      if (ea.kind === 'EaAdd' || ea.kind === 'EaSub') {
        return {
          ...ea,
          base: substituteEaWithOpLabels(ea.base),
          offset: substituteImmWithOpLabels(ea.offset, localLabelMap),
        };
      }
      return ctx.cloneEaExpr(ea);
    };

    if (operand.kind === 'Imm') {
      if (operand.expr.kind === 'ImmName') {
        const bound = ctx.bindings.get(operand.expr.name.toLowerCase());
        const immBound = bindingAsImmExpr(bound, operand.span);
        if (immBound) return { kind: 'Imm', span: operand.span, expr: immBound };
        if (bound) return ctx.cloneOperand(bound);
      }
      return { ...operand, expr: substituteImmWithOpLabels(operand.expr, localLabelMap) };
    }
    if (operand.kind === 'Ea' || operand.kind === 'Mem') {
      return {
        ...operand,
        expr: substituteEaWithOpLabels(operand.expr),
      };
    }
    if (operand.kind === 'PortImm8') {
      return { ...operand, expr: substituteImmWithOpLabels(operand.expr, localLabelMap) };
    }
    return substituteOperand(operand);
  };

  const substituteConditionWithOpLabels = (
    condition: string,
    span: SourceSpan,
    opName: string,
  ): string => {
    const bound = ctx.bindings.get(condition.toLowerCase());
    if (!bound) return condition;
    const token = ctx.normalizeFixedToken(bound);
    if (!token || ctx.inverseConditionName(token) === undefined) {
      ctx.diagAt(
        ctx.diagnostics,
        span,
        `op "${opName}" condition parameter "${condition}" must bind to a condition token (NZ/Z/NC/C/PO/PE/P/M).`,
      );
      return condition;
    }
    return token;
  };

  return {
    bindingAsImmExpr,
    substituteImm,
    substituteOperand,
    substituteImmWithOpLabels,
    substituteOperandWithOpLabels,
    substituteConditionWithOpLabels,
  };
}
