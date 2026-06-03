import type { Z80Operand } from '../z80/instruction.js';

export function regName(operand: Z80Operand | undefined): string | undefined {
  if (operand === undefined) return undefined;
  switch (operand.kind) {
    case 'reg8':
    case 'reg16':
    case 'reg-index16':
    case 'reg-half-index':
      return operand.register.toUpperCase();
    default:
      return undefined;
  }
}
