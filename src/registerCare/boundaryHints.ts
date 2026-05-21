import type { RegisterCareInstruction } from './types.js';

export function precedingCServiceName(item: RegisterCareInstruction | undefined): string | undefined {
  const inst = item?.instruction;
  if (!inst || inst.head.toLowerCase() !== 'ld' || inst.operands.length !== 2) return undefined;
  const dst = inst.operands[0];
  const src = inst.operands[1];
  if (dst?.kind !== 'Reg' || dst.name.toUpperCase() !== 'C') return undefined;
  return src?.kind === 'Imm' && src.expr.kind === 'ImmName' ? src.expr.name : undefined;
}
