import type { Z80Instruction, Z80Operand } from '../z80/instruction.js';

type OperandSelector = (instruction: Z80Instruction, index: number) => Z80Operand | undefined;
type OperandCount = number | ((instruction: Z80Instruction) => number);

const OPERAND_COUNTS: Readonly<Record<string, OperandCount>> = {
  ret: 0,
  'ret-cc': 1,
  jp: 1,
  'jp-cc': 1,
  jr: 1,
  'jr-cc': 1,
  djnz: 1,
  call: 1,
  'call-cc': 1,
  sub: 1,
  and: 1,
  or: 1,
  xor: 1,
  cp: 1,
  ld: 2,
  ex: 2,
  add: targetedAluOperandCount,
  adc: targetedAluOperandCount,
  sbc: targetedAluOperandCount,
};

const OPERAND_SELECTORS: Readonly<Record<string, OperandSelector>> = {
  ld: ldOperand,
  ex: exOperand,
  add: aluOperand,
  adc: aluOperand,
  sbc: aluOperand,
  sub: sourceOperand,
  and: sourceOperand,
  or: sourceOperand,
  xor: sourceOperand,
  cp: sourceOperand,
};

export function instructionOperandCount(instruction: Z80Instruction): number {
  const count = OPERAND_COUNTS[instruction.mnemonic];
  if (count === undefined) return 0;
  return typeof count === 'number' ? count : count(instruction);
}

export function instructionOperand(
  instruction: Z80Instruction,
  index: number,
): Z80Operand | undefined {
  return OPERAND_SELECTORS[instruction.mnemonic]?.(instruction, index);
}

function targetedAluOperandCount(instruction: Z80Instruction): number {
  return 'target' in instruction ? 2 : 1;
}

function positionalOperand(
  index: number,
  target: Z80Operand,
  source: Z80Operand,
): Z80Operand | undefined {
  if (index === 0) return target;
  if (index === 1) return source;
  return undefined;
}

function ldOperand(instruction: Z80Instruction, index: number): Z80Operand | undefined {
  return instruction.mnemonic === 'ld'
    ? positionalOperand(index, instruction.target, instruction.source)
    : undefined;
}

function exOperand(instruction: Z80Instruction, index: number): Z80Operand | undefined {
  if (instruction.mnemonic !== 'ex') return undefined;
  if (index === 0) return firstExOperand(instruction.form);
  if (index === 1) return secondExOperand(instruction.form);
  return undefined;
}

function firstExOperand(
  form: Extract<Z80Instruction, { readonly mnemonic: 'ex' }>['form'],
): Z80Operand | undefined {
  if (form === 'de-hl') return { kind: 'reg16', register: 'de' };
  if (form === 'af-af') return { kind: 'reg16', register: 'af' as 'bc' };
  return undefined;
}

function secondExOperand(
  form: Extract<Z80Instruction, { readonly mnemonic: 'ex' }>['form'],
): Z80Operand | undefined {
  return form === 'de-hl' ? { kind: 'reg16', register: 'hl' } : undefined;
}

function aluOperand(instruction: Z80Instruction, index: number): Z80Operand | undefined {
  if (
    instruction.mnemonic !== 'add' &&
    instruction.mnemonic !== 'adc' &&
    instruction.mnemonic !== 'sbc'
  ) {
    return undefined;
  }
  if ('target' in instruction) {
    return positionalOperand(index, instruction.target, instruction.source);
  }
  return index === 0 ? instruction.source : undefined;
}

function sourceOperand(instruction: Z80Instruction, index: number): Z80Operand | undefined {
  if (index !== 0) return undefined;
  switch (instruction.mnemonic) {
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return instruction.source;
    default:
      return undefined;
  }
}
