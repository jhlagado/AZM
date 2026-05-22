import type { EncodedZ80Instruction, Z80Condition, Z80Instruction } from './instruction.js';

export function encodeZ80Instruction(instruction: Z80Instruction): EncodedZ80Instruction {
  switch (instruction.mnemonic) {
    case 'nop':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0x00] }] };
    case 'ret':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0xc9] }] };
    case 'ld-a-imm':
      return {
        size: 2,
        fragments: [
          { kind: 'bytes', bytes: [0x3e] },
          { kind: 'imm8', expression: instruction.expression },
        ],
      };
    case 'jp':
      return absoluteTarget(0xc3, instruction.expression);
    case 'call':
      return absoluteTarget(0xcd, instruction.expression);
    case 'jr':
      return relativeTarget(0x18, 'jr', instruction.expression);
    case 'jr-cc':
      return relativeTarget(
        jrConditionOpcode(instruction.condition),
        `jr ${instruction.condition}`,
        instruction.expression,
      );
    case 'djnz':
      return relativeTarget(0x10, 'djnz', instruction.expression);
  }
}

function absoluteTarget(opcode: number, expression: Z80InstructionTarget): EncodedZ80Instruction {
  return {
    size: 3,
    fragments: [
      { kind: 'bytes', bytes: [opcode] },
      { kind: 'abs16', expression },
    ],
  };
}

function relativeTarget(
  opcode: number,
  mnemonic: string,
  expression: Z80InstructionTarget,
): EncodedZ80Instruction {
  return {
    size: 2,
    fragments: [
      { kind: 'bytes', bytes: [opcode] },
      { kind: 'rel8', expression, mnemonic },
    ],
  };
}

type Z80InstructionTarget = Extract<Z80Instruction, { readonly expression: unknown }>['expression'];

function jrConditionOpcode(condition: Z80Condition): number {
  switch (condition) {
    case 'nz':
      return 0x20;
    case 'z':
      return 0x28;
    case 'nc':
      return 0x30;
    case 'c':
      return 0x38;
  }
}
