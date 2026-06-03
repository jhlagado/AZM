import type { Z80Instruction } from '../z80/instruction.js';
import { formatLoweredNumber, type LoweredEvalContext } from './asm80-expressions.js';
import { formatIndexedMemory, formatLd, type LdOperand } from './asm80-ld-operands.js';

export type BitInstruction = Extract<Z80Instruction, { readonly mnemonic: 'bit' | 'res' | 'set' }>;
export type RotateShiftInstruction = Extract<
  Z80Instruction,
  { readonly mnemonic: 'rlc' | 'rrc' | 'rl' | 'rr' | 'sla' | 'sra' | 'sll' | 'sls' | 'srl' }
>;

export { formatIndexedMemory, formatLd, type LdOperand };

export function formatRotateShift(
  instruction: RotateShiftInstruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  const operand = formatBitOperand(instruction.operand, evalContext);
  if (operand === undefined) {
    return undefined;
  }
  const parts = [operand];
  if (instruction.destination) {
    parts.push(instruction.destination.register);
  }
  return { text: `${instruction.mnemonic} ${parts.join(', ')}` };
}

export function formatBitOp(
  instruction: BitInstruction,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  const bit = formatLoweredNumber(instruction.bit, 'byte');
  const operand = formatBitOperand(instruction.operand, evalContext);
  if (operand === undefined) {
    return undefined;
  }
  const parts = [bit, operand];
  if (instruction.destination) {
    parts.push(instruction.destination.register);
  }
  return { text: `${instruction.mnemonic} ${parts.join(', ')}` };
}

function formatBitOperand(
  operand: BitInstruction['operand'],
  evalContext: LoweredEvalContext,
): string | undefined {
  if (operand.kind === 'reg8') {
    return operand.register;
  }
  if (operand.kind === 'reg-indirect' && operand.register === 'hl') {
    return '(HL)';
  }
  if (operand.kind === 'indexed') {
    return formatIndexedMemory(operand.register, operand.displacement, evalContext);
  }
  return undefined;
}
