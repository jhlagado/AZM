import { evaluateKnownConstant } from './constants.js';
import type { RegisterContractsInstruction } from './types.js';

export function precedingCServiceName(
  item: RegisterContractsInstruction | undefined,
): string | undefined {
  const instruction = item?.instruction;
  if (!instruction || instruction.mnemonic !== 'ld') return undefined;
  if (instruction.target?.kind !== 'reg8' || instruction.target.register !== 'c') return undefined;
  if (instruction.source.kind === 'imm' && instruction.source.expression.kind === 'symbol') {
    return instruction.source.expression.name;
  }
  return undefined;
}

export function precedingRegisterImmediateValue(
  item: RegisterContractsInstruction | undefined,
  register: string,
): number | undefined {
  const instruction = item?.instruction;
  if (!instruction || instruction.mnemonic !== 'ld') return undefined;
  if (
    instruction.target?.kind !== 'reg8' ||
    instruction.target.register !== register.toLowerCase()
  ) {
    return undefined;
  }
  if (instruction.source.kind !== 'imm') return undefined;
  return evaluateKnownConstant(instruction.source.expression, item.constants ?? new Map());
}
