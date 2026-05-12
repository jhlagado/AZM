import type { AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import { evalImmExpr as evalImmExprWithEnv } from '../semantics/env.js';
import type { SectionKind } from './loweringTypes.js';
import type { LoweringContext } from './programLowering.js';

export type ClassicNode = {
  kind: string;
  span: SourceSpan;
  name?: string;
  value?: ImmExprNode;
  expr?: ImmExprNode;
  directive?: 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr';
  values?: unknown[];
  size?: ImmExprNode;
  fill?: ImmExprNode;
  head?: string;
  operands?: AsmOperandNode[];
};

type ClassicAddressContext = Pick<
  LoweringContext,
  | 'activeSectionRef'
  | 'baseExprs'
  | 'codeOffsetRef'
  | 'dataOffsetRef'
  | 'varOffsetRef'
  | 'evalImmExpr'
  | 'env'
  | 'diagnostics'
>;

type ClassicEvalContext = Pick<LoweringContext, 'env' | 'diagnostics'>;

function isKind(item: { kind: string }, ...kinds: string[]): boolean {
  return kinds.includes(item.kind);
}

export function isClassicEqu(item: { kind: string }): boolean {
  return isKind(item, 'ClassicEqu', 'ClassicEquDecl', 'EquDecl');
}

export function isClassicOrg(item: { kind: string }): boolean {
  return isKind(item, 'ClassicOrg', 'ClassicOrgDirective', 'OrgDirective');
}

export function isClassicAlign(item: { kind: string }): boolean {
  return isKind(item, 'ClassicAlign', 'ClassicAlignDirective');
}

export function isClassicRawData(item: { kind: string }): boolean {
  return isKind(item, 'ClassicRawData', 'ClassicRawDataDecl') || 'valuesText' in item;
}

export function isClassicBinFrom(item: { kind: string }): boolean {
  return isKind(item, 'ClassicBinFrom', 'ClassicBinFromDirective', 'BinFromDirective');
}

export function isClassicBinTo(item: { kind: string }): boolean {
  return isKind(item, 'ClassicBinTo', 'ClassicBinToDirective', 'BinToDirective');
}

export function isClassicEnd(item: { kind: string }): boolean {
  return isKind(item, 'ClassicEnd', 'ClassicEndDirective');
}

export function classicExpr(item: ClassicNode): ImmExprNode | undefined {
  return item.value ?? item.expr;
}

export function activeSectionOffset(ctx: ClassicAddressContext): number {
  return ctx.activeSectionRef.current === 'data' ? ctx.dataOffsetRef.current : ctx.codeOffsetRef.current;
}

export function activeSectionAddress(ctx: ClassicAddressContext): number | undefined {
  return sectionAddressAtOffset(ctx, ctx.activeSectionRef.current, activeSectionOffset(ctx));
}

export function activeClassicAddress(ctx: ClassicAddressContext): number | undefined {
  const section = ctx.activeSectionRef.current;
  const offset =
    section === 'data'
      ? ctx.dataOffsetRef.current
      : section === 'var'
        ? ctx.varOffsetRef.current
        : ctx.codeOffsetRef.current;
  return sectionAddressAtOffset(ctx, section, offset);
}

export function sectionAddressAtOffset(
  ctx: Pick<ClassicAddressContext, 'baseExprs' | 'evalImmExpr' | 'env' | 'diagnostics'>,
  section: SectionKind,
  offset: number,
): number | undefined {
  const baseExpr = section === 'data' ? ctx.baseExprs.data : section === 'var' ? undefined : ctx.baseExprs.code;
  if (!baseExpr) return offset;
  const base = ctx.evalImmExpr(baseExpr, ctx.env, ctx.diagnostics);
  return base === undefined ? undefined : base + offset;
}

export function containsCurrentLocation(expr: ImmExprNode): boolean {
  switch (expr.kind) {
    case 'ImmCurrentLocation':
      return true;
    case 'ImmUnary':
      return containsCurrentLocation(expr.expr);
    case 'ImmBinary':
      return containsCurrentLocation(expr.left) || containsCurrentLocation(expr.right);
    default:
      return false;
  }
}

export function evalClassicImmAtCurrent(
  ctx: ClassicEvalContext,
  expr: ImmExprNode,
  currentLocation: number,
): number | undefined {
  return evalImmExprWithEnv(expr, ctx.env, ctx.diagnostics, { currentLocation });
}

export function publishClassicAddressConst(ctx: LoweringContext, name: string, address: number): void {
  ctx.env.consts.set(name, address);
  ctx.env.consts.set(name.toLowerCase(), address);
}
