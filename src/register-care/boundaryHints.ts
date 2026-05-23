import type { RegisterCareInstruction } from './types.js';

export function precedingCServiceName(
  item: RegisterCareInstruction | undefined,
): string | undefined {
  const instruction = item?.instruction;
  if (!instruction || instruction.mnemonic !== 'ld') return undefined;
  if (instruction.target?.kind !== 'reg8' || instruction.target.register !== 'c') return undefined;
  if (instruction.source.kind === 'imm' && instruction.source.expression.kind === 'symbol') {
    return instruction.source.expression.name;
  }
  return undefined;
}
