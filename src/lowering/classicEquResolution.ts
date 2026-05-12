import type { ImmExprNode } from '../frontend/ast.js';
import { evalImmExpr, type CompileEnv } from '../semantics/env.js';

export type ClassicEquResolutionContext = {
  env: CompileEnv;
  lookupSymbol?: (nameLower: string) => number | undefined;
  cacheResolved?: (nameLower: string, value: number) => void;
};

function scopedEnv(ctx: ClassicEquResolutionContext): CompileEnv {
  if (!ctx.lookupSymbol) return ctx.env;
  const consts = new Map(ctx.env.consts);
  for (const name of ctx.env.classicEquExprs?.keys() ?? []) {
    const lower = name.toLowerCase();
    const value = ctx.lookupSymbol(lower);
    if (value !== undefined) consts.set(lower, value);
  }
  return { ...ctx.env, consts };
}

export function resolveClassicEquSymbol(
  name: string,
  ctx: ClassicEquResolutionContext,
  visiting = new Set<string>(),
): number | undefined {
  const lower = name.toLowerCase();
  const symbol = ctx.lookupSymbol?.(lower);
  if (symbol !== undefined) return symbol;
  const direct = ctx.env.consts.get(name) ?? ctx.env.enums.get(name);
  if (direct !== undefined) return direct;
  const alt = ctx.env.consts.get(lower) ?? ctx.env.enums.get(lower);
  if (alt !== undefined) return alt;

  const equ = ctx.env.classicEquExprs?.get(name) ?? ctx.env.classicEquExprs?.get(lower);
  if (!equ || visiting.has(lower)) return undefined;
  visiting.add(lower);
  try {
    const value = evalClassicEquExpr(equ.expr, ctx, visiting, equ.currentLocation);
    if (value !== undefined) {
      ctx.cacheResolved?.(lower, value);
    }
    return value;
  } finally {
    visiting.delete(lower);
  }
}

export function evalClassicEquExpr(
  expr: ImmExprNode,
  ctx: ClassicEquResolutionContext,
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
      return resolveClassicEquSymbol(expr.name, ctx, visiting);
    case 'ImmUnary': {
      const v = evalClassicEquExpr(expr.expr, ctx, visiting, currentLocation);
      if (v === undefined) return undefined;
      switch (expr.op) {
        case '+':
          return +v;
        case '-':
          return -v;
        case '~':
          return ~v;
      }
      return undefined;
    }
    case 'ImmBinary': {
      const left = evalClassicEquExpr(expr.left, ctx, visiting, currentLocation);
      const right = evalClassicEquExpr(expr.right, ctx, visiting, currentLocation);
      if (left === undefined || right === undefined) return undefined;
      switch (expr.op) {
        case '*':
          return left * right;
        case '/':
          return right === 0 ? undefined : Math.trunc(left / right);
        case '%':
          return right === 0 ? undefined : left % right;
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '&':
          return left & right;
        case '^':
          return left ^ right;
        case '|':
          return left | right;
        case '<<':
          return left << right;
        case '>>':
          return left >> right;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}
