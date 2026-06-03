import type { RegisterContractsInstruction } from './types.js';
import { instructionOperand, instructionOperandCount } from './instruction-operands.js';
import { instructionHead } from './instruction-head.js';
import { regName } from './operand-register-name.js';

function immValue(item: RegisterContractsInstruction): number | undefined {
  const instruction = item.instruction;
  if (instruction.mnemonic !== 'cp' || instruction.source.kind !== 'imm') return undefined;
  const expression = instruction.source.expression;
  return expression.kind === 'number' ? expression.value : undefined;
}

export function isUnconditionalReturnInstruction(item: RegisterContractsInstruction): boolean {
  const head = instructionHead(item);
  if (head === 'ret') return item.instruction.mnemonic === 'ret';
  return head === 'retn' || head === 'reti';
}

export function isPureTokenTransferInstruction(item: RegisterContractsInstruction): boolean {
  const head = instructionHead(item);
  if (head === 'ex') return true;
  if (head !== 'ld' || instructionOperandCount(item.instruction) !== 2) return false;
  const dst = instructionOperand(item.instruction, 0);
  const src = instructionOperand(item.instruction, 1);
  if (regName(dst) === undefined) return false;
  return regName(src) !== undefined || src?.kind === 'imm';
}

export function isAccumulatorSelfOperand(item: RegisterContractsInstruction): boolean {
  const inst = item.instruction;
  if (inst.mnemonic === 'or' || inst.mnemonic === 'and' || inst.mnemonic === 'xor') {
    return inst.source.kind === 'reg8' && inst.source.register === 'a';
  }
  return false;
}

export function isImmediateZeroOperand(item: RegisterContractsInstruction): boolean {
  return immValue(item) === 0;
}

export function isRegisterOperand(
  item: RegisterContractsInstruction | undefined,
  index: number,
  name: string,
): boolean {
  if (item === undefined) return false;
  const operand = instructionOperand(item.instruction, index);
  return regName(operand) === name.toUpperCase();
}
