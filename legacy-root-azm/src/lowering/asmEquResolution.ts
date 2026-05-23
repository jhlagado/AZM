import type { ImmExprNode } from '../frontend/ast.js';
import { evalImmExpr, type CompileEnv } from '../semantics/env.js';
import { evalBinaryImmOp, evalUnaryImmOp } from './immMath.js';

type AsmEquResolutionContext = {
  env: CompileEnv;
  lookupSymbol?: (nameLower: string) => number | undefined;
  cacheResolved?: (nameLower: string, value: number) => void;
};

function scopedEnv(ctx: AsmEquResolutionContext): CompileEnv {
  if (!ctx.lookupSymbol) return ctx.env;
  const equates = new Map(ctx.env.equates);
  for (const name of ctx.env.asmEquExprs?.keys() ?? []) {
    const lower = name.toLowerCase();
    const value = ctx.lookupSymbol(lower);
    if (value !== undefined) equates.set(lower, value);
  }
  return { ...ctx.env, equates };
}

export function resolveAsmEquSymbol(
  name: string,
  ctx: AsmEquResolutionContext,
  visiting = new Set<string>(),
): number | undefined {
  const lower = name.toLowerCase();
  const symbol = ctx.lookupSymbol?.(lower);
  if (symbol !== undefined) return symbol;
  const direct = ctx.env.equates.get(name) ?? ctx.env.enums.get(name);
  if (direct !== undefined) return direct;
  const alt = ctx.env.equates.get(lower) ?? ctx.env.enums.get(lower);
  if (alt !== undefined) return alt;

  const equ = ctx.env.asmEquExprs?.get(name) ?? ctx.env.asmEquExprs?.get(lower);
  if (!equ || visiting.has(lower)) return undefined;
  visiting.add(lower);
  try {
    const value = evalAsmEquExpr(equ.expr, ctx, visiting, equ.currentLocation);
    if (value !== undefined) {
      ctx.cacheResolved?.(lower, value);
    }
    return value;
  } finally {
    visiting.delete(lower);
  }
}

function evalAsmEquExpr(
  expr: ImmExprNode,
  ctx: AsmEquResolutionContext,
  visiting = new Set<string>(),
  currentLocation?: number,
): number | undefined {
  const env = scopedEnv(ctx);
  const value =
    currentLocation === undefined
      ? evalImmExpr(expr, env)
      : evalImmExpr(expr, env, undefined, { currentLocation });
  if (value !== undefined) return value;

  switch (expr.kind) {
    case 'ImmCurrentLocation':
      return currentLocation;
    case 'ImmName':
      return resolveAsmEquSymbol(expr.name, ctx, visiting);
    case 'ImmUnary': {
      const v = evalAsmEquExpr(expr.expr, ctx, visiting, currentLocation);
      if (v === undefined) return undefined;
      return evalUnaryImmOp(expr.op, v);
    }
    case 'ImmBinary': {
      const left = evalAsmEquExpr(expr.left, ctx, visiting, currentLocation);
      const right = evalAsmEquExpr(expr.right, ctx, visiting, currentLocation);
      if (left === undefined || right === undefined) return undefined;
      return evalBinaryImmOp(expr.op, left, right);
    }
    default:
      return undefined;
  }
}
