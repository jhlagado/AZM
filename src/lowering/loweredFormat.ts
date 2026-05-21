import type { LoweredImmExpr } from './loweredAsmTypes.js';

const toHex = (value: number, width: number): string =>
  value.toString(16).toUpperCase().padStart(width, '0');

export const formatLoweredNumber = (value: number): string => {
  if (value < 0) {
    const abs = Math.abs(value);
    return `-$${toHex(abs, abs > 0xff ? 4 : 2)}`;
  }
  return `$${toHex(value, value > 0xff ? 4 : 2)}`;
};

export function formatLoweredImmExpr(expr: LoweredImmExpr): string {
  switch (expr.kind) {
    case 'literal':
      return formatLoweredNumber(expr.value);
    case 'symbol': {
      if (expr.addend === 0) return expr.name;
      const addend = formatLoweredNumber(Math.abs(expr.addend));
      return expr.addend > 0 ? `${expr.name}+${addend}` : `${expr.name}-${addend}`;
    }
    case 'unary':
      return `${expr.op}${formatLoweredImmExpr(expr.expr)}`;
    case 'binary':
      return `(${formatLoweredImmExpr(expr.left)} ${expr.op} ${formatLoweredImmExpr(expr.right)})`;
    case 'opaque':
      return expr.text;
  }
}
