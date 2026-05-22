import type {
  EncodedZ80Instruction,
  Z80AluMnemonic,
  Z80Condition,
  Z80Instruction,
  Z80Operand,
  Z80Register16,
  Z80Register8,
  Z80RegisterIndirect,
} from './instruction.js';

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
    case 'ld':
      return encodeLd(instruction.target, instruction.source);
    case 'add':
    case 'adc':
      if ('target' in instruction) {
        return encodeHlAlu(instruction.mnemonic, instruction.source.register);
      }
      return encodeAlu(instruction.mnemonic, instruction.source);
    case 'sub':
    case 'sbc':
      if ('target' in instruction) {
        return encodeHlAlu(instruction.mnemonic, instruction.source.register);
      }
      return encodeAlu(instruction.mnemonic, instruction.source);
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return encodeAlu(instruction.mnemonic, instruction.source);
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

function encodeHlAlu(
  mnemonic: 'add' | 'adc' | 'sbc',
  source: Z80Register16,
): EncodedZ80Instruction {
  const opcode = hlAluOpcode(mnemonic, source);
  return {
    size: opcode.length,
    fragments: [{ kind: 'bytes', bytes: opcode }],
  };
}

function hlAluOpcode(mnemonic: 'add' | 'adc' | 'sbc', source: Z80Register16): readonly number[] {
  const registerCode = register16Code(source);
  switch (mnemonic) {
    case 'add':
      return [0x09 + registerCode * 0x10];
    case 'adc':
      return [0xed, 0x4a + registerCode * 0x10];
    case 'sbc':
      return [0xed, 0x42 + registerCode * 0x10];
  }
}

function encodeAlu(mnemonic: Z80AluMnemonic, source: Z80Operand): EncodedZ80Instruction {
  const opcodes = aluOpcodes(mnemonic);
  if (source.kind === 'reg8') {
    return {
      size: 1,
      fragments: [
        { kind: 'bytes', bytes: [opcodes.registerBase + register8Code(source.register)] },
      ],
    };
  }

  if (source.kind === 'reg-indirect' && source.register === 'hl') {
    return { size: 1, fragments: [{ kind: 'bytes', bytes: [opcodes.memHl] }] };
  }

  if (source.kind === 'imm') {
    return {
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [opcodes.immediate] },
        { kind: 'imm8', expression: source.expression },
      ],
    };
  }

  return { size: 0, fragments: [] };
}

function aluOpcodes(mnemonic: Z80AluMnemonic): {
  readonly registerBase: number;
  readonly immediate: number;
  readonly memHl: number;
} {
  switch (mnemonic) {
    case 'add':
      return { registerBase: 0x80, immediate: 0xc6, memHl: 0x86 };
    case 'adc':
      return { registerBase: 0x88, immediate: 0xce, memHl: 0x8e };
    case 'sub':
      return { registerBase: 0x90, immediate: 0xd6, memHl: 0x96 };
    case 'sbc':
      return { registerBase: 0x98, immediate: 0xde, memHl: 0x9e };
    case 'and':
      return { registerBase: 0xa0, immediate: 0xe6, memHl: 0xa6 };
    case 'or':
      return { registerBase: 0xb0, immediate: 0xf6, memHl: 0xb6 };
    case 'xor':
      return { registerBase: 0xa8, immediate: 0xee, memHl: 0xae };
    case 'cp':
      return { registerBase: 0xb8, immediate: 0xfe, memHl: 0xbe };
  }
}

function encodeLd(target: Z80Operand, source: Z80Operand): EncodedZ80Instruction {
  if (target.kind === 'reg8' && source.kind === 'imm') {
    return {
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [0x06 + register8Code(target.register) * 8] },
        { kind: 'imm8', expression: source.expression },
      ],
    };
  }

  if (target.kind === 'reg8' && source.kind === 'reg8') {
    return {
      size: 1,
      fragments: [
        {
          kind: 'bytes',
          bytes: [0x40 + register8Code(target.register) * 8 + register8Code(source.register)],
        },
      ],
    };
  }

  if (target.kind === 'reg16' && source.kind === 'imm') {
    return {
      size: 3,
      fragments: [
        { kind: 'bytes', bytes: [0x01 + register16Code(target.register) * 0x10] },
        { kind: 'abs16', expression: source.expression },
      ],
    };
  }

  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'reg-indirect') {
    return {
      size: 1,
      fragments: [{ kind: 'bytes', bytes: [loadAFromIndirectOpcode(source.register)] }],
    };
  }

  if (target.kind === 'reg-indirect' && source.kind === 'reg8' && source.register === 'a') {
    return {
      size: 1,
      fragments: [{ kind: 'bytes', bytes: [storeAToIndirectOpcode(target.register)] }],
    };
  }

  if (target.kind === 'reg-indirect' && target.register === 'hl' && source.kind === 'reg8') {
    return {
      size: 1,
      fragments: [{ kind: 'bytes', bytes: [0x70 + register8Code(source.register)] }],
    };
  }

  if (target.kind === 'reg8' && source.kind === 'reg-indirect' && source.register === 'hl') {
    return {
      size: 1,
      fragments: [{ kind: 'bytes', bytes: [0x46 + register8Code(target.register) * 8] }],
    };
  }

  return {
    size: 0,
    fragments: [],
  };
}

function register8Code(register: Z80Register8): number {
  switch (register) {
    case 'b':
      return 0;
    case 'c':
      return 1;
    case 'd':
      return 2;
    case 'e':
      return 3;
    case 'h':
      return 4;
    case 'l':
      return 5;
    case 'a':
      return 7;
  }
}

function register16Code(register: Z80Register16): number {
  switch (register) {
    case 'bc':
      return 0;
    case 'de':
      return 1;
    case 'hl':
      return 2;
    case 'sp':
      return 3;
  }
}

function loadAFromIndirectOpcode(register: Z80RegisterIndirect): number {
  switch (register) {
    case 'bc':
      return 0x0a;
    case 'de':
      return 0x1a;
    case 'hl':
      return 0x7e;
  }
}

function storeAToIndirectOpcode(register: Z80RegisterIndirect): number {
  switch (register) {
    case 'bc':
      return 0x02;
    case 'de':
      return 0x12;
    case 'hl':
      return 0x77;
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
