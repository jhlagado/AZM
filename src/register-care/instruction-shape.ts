import type { Expression } from '../model/expression.js';
import type { Z80Instruction, Z80Operand } from '../z80/instruction.js';
import type { RegisterCareInstruction } from './types.js';

export function instructionHead(item: RegisterCareInstruction): string {
  return item.instruction.mnemonic.toLowerCase();
}

export function regName(operand: Z80Operand | undefined): string | undefined {
  if (operand === undefined) return undefined;
  switch (operand.kind) {
    case 'reg8':
      return operand.register.toUpperCase();
    case 'reg16':
      return operand.register.toUpperCase();
    case 'reg-index16':
      return operand.register.toUpperCase();
    case 'reg-half-index':
      return operand.register.toUpperCase();
    default:
      return undefined;
  }
}

function immValue(operand: Z80Operand | undefined): number | undefined {
  if (operand?.kind !== 'imm') return undefined;
  const expression = operand.expression;
  return expression.kind === 'number' ? expression.value : undefined;
}

export function instructionOperandCount(instruction: Z80Instruction): number {
  switch (instruction.mnemonic) {
    case 'ret':
    case 'ret-cc':
      return instruction.mnemonic === 'ret' ? 0 : 1;
    case 'ld':
      return 2;
    case 'ex':
      return 2;
    case 'jp':
    case 'jp-cc':
    case 'jr':
    case 'jr-cc':
    case 'djnz':
    case 'call':
    case 'call-cc':
      return 1;
    case 'add':
    case 'adc':
    case 'sbc':
      return 'target' in instruction ? 2 : 1;
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return 1;
    default:
      return 0;
  }
}

export function instructionOperand(
  instruction: Z80Instruction,
  index: number,
): Z80Operand | undefined {
  switch (instruction.mnemonic) {
    case 'ld':
      return index === 0 ? instruction.target : index === 1 ? instruction.source : undefined;
    case 'ex': {
      if (index === 0) {
        return instruction.form === 'de-hl'
          ? { kind: 'reg16', register: 'de' }
          : instruction.form === 'af-af'
            ? { kind: 'reg16', register: 'af' as 'bc' }
            : undefined;
      }
      if (index === 1) {
        return instruction.form === 'de-hl'
          ? { kind: 'reg16', register: 'hl' }
          : undefined;
      }
      return undefined;
    }
    case 'add':
    case 'adc':
    case 'sbc':
      if ('target' in instruction) {
        return index === 0 ? instruction.target : index === 1 ? instruction.source : undefined;
      }
      return index === 0 ? instruction.source : undefined;
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return index === 0 ? instruction.source : undefined;
    default:
      return undefined;
  }
}

export function isUnconditionalReturnInstruction(item: RegisterCareInstruction): boolean {
  const head = instructionHead(item);
  if (head === 'ret') return item.instruction.mnemonic === 'ret';
  return head === 'retn' || head === 'reti';
}

export function isPureTokenTransferInstruction(item: RegisterCareInstruction): boolean {
  const head = instructionHead(item);
  if (head === 'ex') return true;
  if (head !== 'ld' || instructionOperandCount(item.instruction) !== 2) return false;
  const dst = instructionOperand(item.instruction, 0);
  const src = instructionOperand(item.instruction, 1);
  if (regName(dst) === undefined) return false;
  return regName(src) !== undefined || src?.kind === 'imm';
}

export function isAccumulatorSelfOperand(item: RegisterCareInstruction): boolean {
  const inst = item.instruction;
  if (inst.mnemonic === 'or' || inst.mnemonic === 'and' || inst.mnemonic === 'xor') {
    return inst.source.kind === 'reg8' && inst.source.register === 'a';
  }
  return false;
}

export function isImmediateZeroOperand(item: RegisterCareInstruction): boolean {
  const inst = item.instruction;
  if (inst.mnemonic !== 'cp') return false;
  return immValue(inst.source) === 0;
}

export function isRegisterOperand(
  item: RegisterCareInstruction | undefined,
  index: number,
  name: string,
): boolean {
  if (item === undefined) return false;
  const operand = instructionOperand(item.instruction, index);
  return regName(operand) === name.toUpperCase();
}
