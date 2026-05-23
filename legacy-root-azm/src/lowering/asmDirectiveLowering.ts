import { evalImmExpr as evalImmExprWithEnv } from '../semantics/env.js';
import type { LoweringContext } from './programLowering.js';
import {
  activePlacementAddress,
  activePlacementOffset,
  asmDirectiveExpr,
  isAsmAlignDirective,
  isAsmBinFromDirective,
  isAsmBinToDirective,
  isAsmEquDirective,
  isAsmOrgDirective,
  type AsmDirectiveLikeNode,
  publishAsmAddressConst,
} from './asmDirectiveTraversal.js';

const BINFROM_SYMBOL_NAME = '__azm_binfrom';
const BINTO_SYMBOL_NAME = '__azm_binto';

function reserveAsmSymbol(ctx: LoweringContext, item: AsmDirectiveLikeNode): string | undefined {
  if (!item.name) return undefined;
  const lower = item.name.toLowerCase();
  if (ctx.taken.has(lower)) {
    ctx.diag(ctx.diagnostics, item.span.file, `Duplicate symbol name "${item.name}".`);
    return undefined;
  }
  ctx.taken.add(lower);
  return item.name;
}

function lowerAsmEquDirective(ctx: LoweringContext, item: AsmDirectiveLikeNode): void {
  const name = reserveAsmSymbol(ctx, item);
  if (!name) return;
  const expr = asmDirectiveExpr(item);
  const currentLocation = activePlacementAddress(ctx);
  if (expr) {
    const record = currentLocation === undefined ? { expr } : { expr, currentLocation };
    ctx.env.asmEquExprs?.set(name, record);
    ctx.env.asmEquExprs?.set(name.toLowerCase(), record);
  }
  const value =
    expr && currentLocation !== undefined
      ? evalImmExprWithEnv(expr, ctx.env, ctx.diagnostics, { currentLocation })
      : (ctx.env.equates.get(name) ?? ctx.env.equates.get(name.toLowerCase()));
  if (value === undefined) {
    if (expr) {
      ctx.recordLoweredAsmItem(
        { kind: 'const', name, value: ctx.lowerImmExprForLoweredAsm(expr) },
        item.span,
      );
    }
    return;
  }
  publishAsmAddressConst(ctx, name, value);
  ctx.symbols.push({
    kind: 'constant',
    name,
    value,
    file: item.span.file,
    line: item.span.start.line,
    scope: 'global',
  });
  ctx.recordLoweredAsmItem({ kind: 'const', name, value: { kind: 'literal', value } }, item.span);
}

function lowerAsmOrgDirective(ctx: LoweringContext, item: AsmDirectiveLikeNode): void {
  const expr = asmDirectiveExpr(item);
  if (!expr) {
    ctx.diag(ctx.diagnostics, item.span.file, `Missing org address.`);
    return;
  }
  const target = ctx.evalImmExpr(expr, ctx.env, ctx.diagnostics);
  if (target === undefined) {
    ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate org address.`);
    return;
  }
  if (target < 0 || target > 0xffff) {
    ctx.diag(ctx.diagnostics, item.span.file, `org address out of range (0..65535).`);
    return;
  }
  const activePlacement = ctx.activePlacementRef.current === 'data' ? 'data' : 'code';
  const offsetRef = activePlacement === 'data' ? ctx.dataOffsetRef : ctx.codeOffsetRef;
  if (offsetRef.current === 0 && ctx.baseExprs[activePlacement] === undefined) {
    ctx.baseExprs[activePlacement] = expr;
    return;
  }
  const base = ctx.baseExprs[activePlacement]
    ? ctx.evalImmExpr(ctx.baseExprs[activePlacement], ctx.env, ctx.diagnostics)
    : 0;
  if (base === undefined) {
    ctx.diag(
      ctx.diagnostics,
      item.span.file,
      `Failed to evaluate current ${activePlacement} base address.`,
    );
    return;
  }
  const offset = target - base;
  if (offset < 0 || offset > 0xffff) {
    ctx.diag(
      ctx.diagnostics,
      item.span.file,
      `org address is outside the current ${activePlacement} placement range.`,
    );
    return;
  }
  if (offset < offsetRef.current) {
    ctx.diag(
      ctx.diagnostics,
      item.span.file,
      `org address overlaps earlier emitted ${activePlacement}.`,
    );
    return;
  }
  const gap = offset - offsetRef.current;
  if (gap > 0) {
    ctx.recordLoweredAsmItem({ kind: 'ds', size: { kind: 'literal', value: gap } }, item.span);
    offsetRef.current = offset;
  }
}

function lowerAsmAlignDirective(ctx: LoweringContext, item: AsmDirectiveLikeNode): void {
  const expr = asmDirectiveExpr(item);
  if (!expr) {
    ctx.diag(ctx.diagnostics, item.span.file, `Missing align value.`);
    return;
  }
  const value = ctx.evalImmExpr(expr, ctx.env, ctx.diagnostics);
  if (value === undefined) {
    ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate align value.`);
    return;
  }
  if (value <= 0) {
    ctx.diag(ctx.diagnostics, item.span.file, `align value must be > 0.`);
    return;
  }
  if (ctx.activePlacementRef.current === 'data') {
    const base = ctx.baseExprs.data
      ? ctx.evalImmExpr(ctx.baseExprs.data, ctx.env, ctx.diagnostics)
      : 0;
    if (base === undefined) {
      ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate current data base address.`);
      return;
    }
    const currentAddress = base + ctx.dataOffsetRef.current;
    const alignedAddress = ctx.alignTo(currentAddress, value);
    const alignedOffset = alignedAddress - base;
    const gap = alignedOffset - ctx.dataOffsetRef.current;
    if (gap > 0) {
      ctx.recordLoweredAsmItem(
        {
          kind: 'ds',
          size: { kind: 'literal', value: gap },
          fill: { kind: 'literal', value: 0 },
        },
        item.span,
      );
    }
    while (ctx.dataOffsetRef.current < alignedOffset) {
      const offset = ctx.dataOffsetRef.current;
      ctx.dataBytes.set(offset, 0);
      ctx.dataOffsetRef.current = offset + 1;
    }
    return;
  }
  const base = ctx.baseExprs.code
    ? ctx.evalImmExpr(ctx.baseExprs.code, ctx.env, ctx.diagnostics)
    : 0;
  if (base === undefined) {
    ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate current code base address.`);
    return;
  }
  const currentAddress = base + ctx.codeOffsetRef.current;
  const alignedAddress = ctx.alignTo(currentAddress, value);
  const alignedOffset = alignedAddress - base;
  const gap = alignedOffset - ctx.codeOffsetRef.current;
  if (gap > 0) {
    ctx.recordLoweredAsmItem(
      {
        kind: 'ds',
        size: { kind: 'literal', value: gap },
        fill: { kind: 'literal', value: 0 },
      },
      item.span,
    );
  }
  while (ctx.codeOffsetRef.current < alignedOffset) {
    const offset = ctx.codeOffsetRef.current;
    ctx.codeBytes.set(offset, 0);
    ctx.codeOffsetRef.current = offset + 1;
  }
}

function lowerAsmLabel(ctx: LoweringContext, item: AsmDirectiveLikeNode): void {
  const offset = activePlacementOffset(ctx);
  const address = activePlacementAddress(ctx);
  const name = reserveAsmSymbol(ctx, item);
  if (!name) return;
  if (address !== undefined) publishAsmAddressConst(ctx, name, address);
  ctx.pending.push({
    kind: 'label',
    name,
    placement: ctx.activePlacementRef.current,
    offset,
    file: item.span.file,
    line: item.span.start.line,
    scope: 'global',
  });
  ctx.recordLoweredAsmItem({ kind: 'label', name }, item.span);
}

function lowerAsmBinRangeSymbol(
  ctx: LoweringContext,
  item: AsmDirectiveLikeNode,
  symbolName: string,
  label: 'binfrom' | 'binto',
): void {
  const expr = asmDirectiveExpr(item);
  if (!expr) {
    ctx.diag(ctx.diagnostics, item.span.file, `Missing ${label} address.`);
    return;
  }
  const value = ctx.evalImmExpr(expr, ctx.env, ctx.diagnostics);
  if (value === undefined) {
    ctx.diag(ctx.diagnostics, item.span.file, `Failed to evaluate ${label} address.`);
    return;
  }
  if (value < 0 || value > 0xffff) {
    ctx.diag(ctx.diagnostics, item.span.file, `${label} address out of range (0..65535).`);
    return;
  }
  const existing = ctx.symbols.find(
    (symbol) => symbol.kind === 'constant' && symbol.name === symbolName,
  );
  if (existing?.kind === 'constant') {
    existing.value = value;
    return;
  }
  ctx.symbols.push({
    kind: 'constant',
    name: symbolName,
    value,
    file: item.span.file,
    line: item.span.start.line,
    scope: 'global',
  });
}

export function tryLowerAsmDirective(ctx: LoweringContext, item: { kind: string }): boolean {
  if (isAsmEquDirective(item)) {
    lowerAsmEquDirective(ctx, item as AsmDirectiveLikeNode);
    return true;
  }
  if (isAsmOrgDirective(item)) {
    lowerAsmOrgDirective(ctx, item as AsmDirectiveLikeNode);
    return true;
  }
  if (isAsmAlignDirective(item)) {
    lowerAsmAlignDirective(ctx, item as AsmDirectiveLikeNode);
    return true;
  }
  if (isAsmBinFromDirective(item)) {
    lowerAsmBinRangeSymbol(ctx, item as AsmDirectiveLikeNode, BINFROM_SYMBOL_NAME, 'binfrom');
    return true;
  }
  if (isAsmBinToDirective(item)) {
    lowerAsmBinRangeSymbol(ctx, item as AsmDirectiveLikeNode, BINTO_SYMBOL_NAME, 'binto');
    return true;
  }
  if (item.kind === 'AsmLabel') {
    lowerAsmLabel(ctx, item as unknown as AsmDirectiveLikeNode);
    return true;
  }
  return false;
}
