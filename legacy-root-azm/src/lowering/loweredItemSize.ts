import type { LoweredAsmItem, LoweredImmExpr } from './loweredAsmTypes.js';

type LoweredSizeEvaluator = (expr: LoweredImmExpr) => number | undefined;

const literalSize = (expr: LoweredImmExpr): number | undefined =>
  expr.kind === 'literal' ? expr.value : undefined;

export function loweredItemSize(
  item: LoweredAsmItem,
  evalSize: LoweredSizeEvaluator = literalSize,
): number {
  switch (item.kind) {
    case 'label':
    case 'const':
    case 'comment':
      return 0;
    case 'db':
      return item.values.length;
    case 'dw':
      return item.values.length * 2;
    case 'ds':
      return Math.max(0, evalSize(item.size) ?? 0);
    case 'instr':
      return item.bytes?.length ?? 0;
  }
}
