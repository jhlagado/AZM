import type { LoweredEaExpr, LoweredImmExpr, LoweredOperand } from '../../src/lowering/loweredAsmTypes.js';
import type { LoweredInstrView } from './lowered_program_types.js';

function toHex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function formatNumber(value: number): string {
  if (value < 0) {
    const abs = Math.abs(value);
    return `-$${toHex(abs, abs > 0xff ? 4 : 2)}`;
  }
  return `$${toHex(value, value > 0xff ? 4 : 2)}`;
}

function formatLoweredImmExpr(expr: LoweredImmExpr): string {
  switch (expr.kind) {
    case 'literal':
      return formatNumber(expr.value);
    case 'symbol': {
      if (expr.addend === 0) return expr.name;
      const addend = formatNumber(Math.abs(expr.addend));
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

function formatLoweredEaExpr(expr: LoweredEaExpr): string {
  switch (expr.kind) {
    case 'name':
      return expr.name;
    case 'imm':
      return formatLoweredImmExpr(expr.expr);
    case 'add':
      return `${formatLoweredEaExpr(expr.base)}+${formatLoweredImmExpr(expr.offset)}`;
    case 'sub':
      return `${formatLoweredEaExpr(expr.base)}-${formatLoweredImmExpr(expr.offset)}`;
    case 'field':
    case 'index':
    case 'layoutCast':
      return `<${expr.kind}>`;
  }
}

function formatLoweredOperand(op: LoweredOperand): string {
  switch (op.kind) {
    case 'reg':
      return op.name.toUpperCase();
    case 'imm':
      return formatLoweredImmExpr(op.expr);
    case 'ea':
      return formatLoweredEaExpr(op.expr);
    case 'mem':
      return `(${formatLoweredEaExpr(op.expr)})`;
    case 'portImm8':
      return `(${formatLoweredImmExpr(op.expr)})`;
    case 'portC':
      return '(C)';
  }
}

export function formatLoweredInstruction(view: LoweredInstrView): string {
  const head = view.head.toUpperCase();
  const ops = view.operands.map(formatLoweredOperand);
  return ops.length ? `${head} ${ops.join(', ')}` : head;
}
