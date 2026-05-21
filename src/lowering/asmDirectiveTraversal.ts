import type { AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import { containsCurrentLocation } from '../frontend/immExprUtils.js';
import { evalImmExpr as evalImmExprWithEnv } from '../semantics/env.js';
import type { PlacementKind } from './loweringTypes.js';
import type { LoweringContext } from './programLowering.js';

export type AsmDirectiveLikeNode = {
  kind: string;
  span: SourceSpan;
  name?: string;
  value?: ImmExprNode;
  directive?: 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr';
  values?: unknown[];
  size?: ImmExprNode;
  fill?: ImmExprNode;
  head?: string;
  operands?: AsmOperandNode[];
};

type AsmAddressContext = Pick<
  LoweringContext,
  | 'activePlacementRef'
  | 'baseExprs'
  | 'codeOffsetRef'
  | 'dataOffsetRef'
  | 'evalImmExpr'
  | 'env'
  | 'diagnostics'
>;

type AsmEvalContext = Pick<LoweringContext, 'env' | 'diagnostics'>;
type AsmPublishContext = Pick<LoweringContext, 'env'>;

function isKind(item: { kind: string }, ...kinds: string[]): boolean {
  return kinds.includes(item.kind);
}

export function isAsmEquDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmEqu');
}

export function isAsmOrgDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmOrg');
}

export function isAsmAlignDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmAlign');
}

export function isAsmRawDataDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmRawData');
}

export function isAsmBinFromDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmBinFrom');
}

export function isAsmBinToDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmBinTo');
}

export function isAsmEndDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmEnd');
}

export function asmDirectiveExpr(item: AsmDirectiveLikeNode): ImmExprNode | undefined {
  return item.value;
}

export function activePlacementOffset(ctx: AsmAddressContext): number {
  return ctx.activePlacementRef.current === 'data' ? ctx.dataOffsetRef.current : ctx.codeOffsetRef.current;
}

export function activePlacementAddress(ctx: AsmAddressContext): number | undefined {
  return placementAddressAtOffset(ctx, ctx.activePlacementRef.current, activePlacementOffset(ctx));
}

export function placementAddressAtOffset(
  ctx: Pick<AsmAddressContext, 'baseExprs' | 'evalImmExpr' | 'env' | 'diagnostics'>,
  placement: PlacementKind,
  offset: number,
): number | undefined {
  const baseExpr = placement === 'data' ? ctx.baseExprs.data : ctx.baseExprs.code;
  if (!baseExpr) return offset;
  const base = ctx.evalImmExpr(baseExpr, ctx.env, ctx.diagnostics);
  return base === undefined ? undefined : base + offset;
}

export { containsCurrentLocation };

export function evalAsmImmAtCurrent(
  ctx: AsmEvalContext,
  expr: ImmExprNode,
  currentLocation: number,
): number | undefined {
  return evalImmExprWithEnv(expr, ctx.env, ctx.diagnostics, { currentLocation });
}

export function publishAsmAddressConst(ctx: AsmPublishContext, name: string, address: number): void {
  ctx.env.equates.set(name, address);
  ctx.env.equates.set(name.toLowerCase(), address);
}
