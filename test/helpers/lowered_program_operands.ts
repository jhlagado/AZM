import type { LoweredOperand } from '../../legacy-root-azm/src/lowering/loweredAsmTypes.js';

export function isReg(op: LoweredOperand | undefined, name: string): boolean {
  return !!op && op.kind === 'reg' && op.name.toUpperCase() === name.toUpperCase();
}
