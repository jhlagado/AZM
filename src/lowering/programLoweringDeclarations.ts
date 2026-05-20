import type {
  ImmExprNode,
  RawDataDeclNode,
} from '../frontend/ast.js';

import type { Context } from './programLowering.js';
import {
  createAsmRawDataLowerer,
  type RawDataLike,
} from './asmRawDataLowering.js';

export function createProgramLoweringDeclarationHelpers(ctx: Context): {
  lowerRawDataDecl: (decl: RawDataDeclNode) => void;
  lowerAsmRawDataDirective: (decl: RawDataLike) => void;
} {
  const symbolicTargetFromExpr = (
    expr: ImmExprNode,
  ): { baseLower: string; addend: number } | undefined => {
    if (expr.kind === 'ImmName') return { baseLower: expr.name.toLowerCase(), addend: 0 };
    if (expr.kind !== 'ImmBinary') return undefined;
    if (expr.op !== '+' && expr.op !== '-') return undefined;

    const leftName = expr.left.kind === 'ImmName' ? expr.left.name.toLowerCase() : undefined;
    const rightName = expr.right.kind === 'ImmName' ? expr.right.name.toLowerCase() : undefined;

    if (leftName) {
      const right = ctx.evalImmExpr(expr.right, ctx.env, ctx.diagnostics);
      if (right === undefined) return undefined;
      return { baseLower: leftName, addend: expr.op === '+' ? right : -right };
    }

    if (expr.op === '+' && rightName) {
      const left = ctx.evalImmExpr(expr.left, ctx.env, ctx.diagnostics);
      if (left === undefined) return undefined;
      return { baseLower: rightName, addend: left };
    }

    return undefined;
  };

  const lowerRawDataDecl = (decl: RawDataDeclNode): void => {
    ctx.diag(ctx.diagnostics, decl.span.file, `Raw data declaration nodes are retired ZAX syntax.`);
  };

  const lowerAsmRawDataDirective = createAsmRawDataLowerer(ctx, symbolicTargetFromExpr);

  return { lowerRawDataDecl, lowerAsmRawDataDirective };
}
