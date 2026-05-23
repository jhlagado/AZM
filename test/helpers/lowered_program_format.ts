import { formatLoweredImmExpr } from '../../legacy-root-azm/src/lowering/loweredFormat.js';
import type { LoweredEaExpr, LoweredOperand } from '../../legacy-root-azm/src/lowering/loweredAsmTypes.js';
import type { LoweredInstrView } from './lowered_program_types.js';

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
