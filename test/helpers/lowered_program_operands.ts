import type { LoweredEaExpr, LoweredOperand } from '../../src/lowering/loweredAsmTypes.js';
import type { LoweredInstrView, OperandPredicate } from './lowered_program_types.js';

export function operandUsesIx(op: LoweredOperand): boolean {
  if (op.kind !== 'mem' && op.kind !== 'ea') return false;
  const usesIx = (expr: LoweredEaExpr): boolean => {
    switch (expr.kind) {
      case 'name':
        return expr.name.toUpperCase() === 'IX';
      case 'add':
      case 'sub':
        return usesIx(expr.base);
      case 'imm':
      case 'field':
      case 'index':
      case 'reinterpret':
        return false;
    }
  };
  return usesIx(op.expr);
}

export function hasOperands(view: LoweredInstrView, ...predicates: OperandPredicate[]): boolean {
  return (
    view.operands.length === predicates.length &&
    predicates.every((predicate, index) => predicate(view.operands[index]))
  );
}

export function isReg(op: LoweredOperand | undefined, name: string): boolean {
  return !!op && op.kind === 'reg' && op.name.toUpperCase() === name.toUpperCase();
}

export function isImmLiteral(op: LoweredOperand | undefined, value: number): boolean {
  return !!op && op.kind === 'imm' && op.expr.kind === 'literal' && op.expr.value === value;
}

export function isImmSymbol(op: LoweredOperand | undefined, name: string, addend = 0): boolean {
  return (
    !!op &&
    op.kind === 'imm' &&
    op.expr.kind === 'symbol' &&
    op.expr.name.toUpperCase() === name.toUpperCase() &&
    op.expr.addend === addend
  );
}

export function isEaName(op: LoweredOperand | undefined, name: string): boolean {
  return (
    !!op &&
    ((op.kind === 'ea' && op.expr.kind === 'name') || (op.kind === 'mem' && op.expr.kind === 'name')) &&
    op.expr.name.toUpperCase() === name.toUpperCase()
  );
}

export function isMemName(op: LoweredOperand | undefined, name: string): boolean {
  return !!op && op.kind === 'mem' && op.expr.kind === 'name' && op.expr.name.toUpperCase() === name.toUpperCase();
}

export function isMemIxDisp(op: LoweredOperand | undefined, disp: number): boolean {
  if (!op || op.kind !== 'mem') return false;
  const expr = op.expr;
  if (expr.kind === 'add' || expr.kind === 'sub') {
    if (expr.base.kind !== 'name' || expr.base.name.toUpperCase() !== 'IX') return false;
    if (expr.offset.kind !== 'literal') return false;
    const sign = expr.kind === 'add' ? 1 : -1;
    return sign * expr.offset.value === disp;
  }
  return false;
}
