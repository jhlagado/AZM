import type {
  EncodedZ80Instruction,
  Z80AluMnemonic,
  Z80BitMnemonic,
  Z80Condition,
  Z80CoreMnemonic,
  Z80IndexHalfRegister,
  Z80IndexRegister16,
  Z80Instruction,
  Z80JumpIndirectRegister,
  Z80Operand,
  Z80RelativeCondition,
  Z80Register16,
  Z80Register8,
  Z80RegisterIndirect,
  Z80RotateShiftMnemonic,
  Z80RstVector,
  Z80StackRegister16,
} from './instruction.js';

export function encodeZ80Instruction(instruction: Z80Instruction): EncodedZ80Instruction {
  switch (instruction.mnemonic) {
    case 'nop':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0x00] }] };
    case 'ret':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0xc9] }] };
    case 'ret-cc':
      return {
        size: 1,
        fragments: [{ kind: 'bytes', bytes: [retConditionOpcode(instruction.condition)] }],
      };
    case 'di':
    case 'ei':
    case 'scf':
    case 'ccf':
    case 'cpl':
    case 'daa':
    case 'exx':
    case 'halt':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldir':
    case 'ldd':
    case 'lddr':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'ini':
    case 'inir':
    case 'ind':
    case 'indr':
    case 'outi':
    case 'otir':
    case 'outd':
    case 'otdr':
    case 'reti':
    case 'retn':
      return encodeCore(instruction.mnemonic);
    case 'ex':
      return encodeExchange(instruction.form);
    case 'im':
      return {
        size: 2,
        fragments: [{ kind: 'bytes', bytes: [0xed, imOpcode(instruction.mode)] }],
      };
    case 'rst':
      return {
        size: 1,
        fragments: [{ kind: 'bytes', bytes: [rstOpcode(instruction.vector)] }],
      };
    case 'inc':
    case 'dec':
      return encodeIncDec(instruction.mnemonic, instruction.operand);
    case 'push':
    case 'pop':
      return encodeStack(instruction.mnemonic, instruction.register);
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
    case 'in':
      return encodeIn(instruction.target, instruction.port);
    case 'out':
      return encodeOut(instruction.port, instruction.source);
    case 'bit':
    case 'res':
    case 'set':
      return encodeBitLike(
        instruction.mnemonic,
        instruction.bit,
        instruction.operand,
        instruction.destination,
      );
    case 'rlc':
    case 'rrc':
    case 'rl':
    case 'rr':
    case 'sla':
    case 'sra':
    case 'sll':
    case 'sls':
    case 'srl':
      return encodeRotateShift(instruction.mnemonic, instruction.operand, instruction.destination);
    case 'add':
    case 'adc':
      if ('target' in instruction) {
        return encode16BitAlu(
          instruction.mnemonic,
          instruction.target.register,
          instruction.source.register,
        );
      }
      return encodeAlu(instruction.mnemonic, instruction.source);
    case 'sub':
    case 'sbc':
      if ('target' in instruction) {
        return encode16BitAlu(
          instruction.mnemonic,
          instruction.target.register,
          instruction.source.register,
        );
      }
      return encodeAlu(instruction.mnemonic, instruction.source);
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return encodeAlu(instruction.mnemonic, instruction.source);
    case 'jp':
      return absoluteTarget(0xc3, instruction.expression);
    case 'jp-cc':
      return absoluteTarget(jpConditionOpcode(instruction.condition), instruction.expression);
    case 'jp-indirect':
      return jumpIndirect(instruction.register);
    case 'call':
      return absoluteTarget(0xcd, instruction.expression);
    case 'call-cc':
      return absoluteTarget(callConditionOpcode(instruction.condition), instruction.expression);
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

function encodeExchange(
  form: Extract<Z80Instruction, { readonly mnemonic: 'ex' }>['form'],
): EncodedZ80Instruction {
  switch (form) {
    case 'af-af':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0x08] }] };
    case 'de-hl':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0xeb] }] };
    case 'sp-hl':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0xe3] }] };
    case 'sp-ix':
      return { size: 2, fragments: [{ kind: 'bytes', bytes: [0xdd, 0xe3] }] };
    case 'sp-iy':
      return { size: 2, fragments: [{ kind: 'bytes', bytes: [0xfd, 0xe3] }] };
  }
}

function encodeCore(mnemonic: Z80CoreMnemonic) {
  const opcode = coreOpcode(mnemonic);
  return {
    size: opcode.length,
    fragments: [{ kind: 'bytes' as const, bytes: opcode }],
  };
}

function coreOpcode(mnemonic: Z80CoreMnemonic): readonly number[] {
  switch (mnemonic) {
    case 'di':
      return [0xf3];
    case 'ei':
      return [0xfb];
    case 'scf':
      return [0x37];
    case 'ccf':
      return [0x3f];
    case 'cpl':
      return [0x2f];
    case 'daa':
      return [0x27];
    case 'exx':
      return [0xd9];
    case 'halt':
      return [0x76];
    case 'rlca':
      return [0x07];
    case 'rrca':
      return [0x0f];
    case 'rla':
      return [0x17];
    case 'rra':
      return [0x1f];
    case 'neg':
      return [0xed, 0x44];
    case 'rrd':
      return [0xed, 0x67];
    case 'rld':
      return [0xed, 0x6f];
    case 'ldi':
      return [0xed, 0xa0];
    case 'ldir':
      return [0xed, 0xb0];
    case 'ldd':
      return [0xed, 0xa8];
    case 'lddr':
      return [0xed, 0xb8];
    case 'cpi':
      return [0xed, 0xa1];
    case 'cpir':
      return [0xed, 0xb1];
    case 'cpd':
      return [0xed, 0xa9];
    case 'cpdr':
      return [0xed, 0xb9];
    case 'ini':
      return [0xed, 0xa2];
    case 'inir':
      return [0xed, 0xb2];
    case 'ind':
      return [0xed, 0xaa];
    case 'indr':
      return [0xed, 0xba];
    case 'outi':
      return [0xed, 0xa3];
    case 'otir':
      return [0xed, 0xb3];
    case 'outd':
      return [0xed, 0xab];
    case 'otdr':
      return [0xed, 0xbb];
    case 'reti':
      return [0xed, 0x4d];
    case 'retn':
      return [0xed, 0x45];
  }
}

function encodeIn(
  target: { readonly kind: 'reg8'; readonly register: Z80Register8 } | undefined,
  port: Extract<Z80Instruction, { readonly mnemonic: 'in' }>['port'],
): EncodedZ80Instruction {
  if (port.kind === 'c') {
    const opcode = target ? 0x40 + register8Code(target.register) * 8 : 0x70;
    return { size: 2, fragments: [{ kind: 'bytes', bytes: [0xed, opcode] }] };
  }
  return {
    size: 2,
    fragments: [
      { kind: 'bytes', bytes: [0xdb] },
      {
        kind: 'port8',
        expression: port.expression,
        message: 'in a,(n) expects an imm8 port number',
      },
    ],
  };
}

function encodeOut(
  port: Extract<Z80Instruction, { readonly mnemonic: 'out' }>['port'],
  source: Extract<Z80Instruction, { readonly mnemonic: 'out' }>['source'],
): EncodedZ80Instruction {
  if (port.kind === 'c') {
    const opcode = source.kind === 'zero' ? 0x71 : 0x41 + register8Code(source.register) * 8;
    return { size: 2, fragments: [{ kind: 'bytes', bytes: [0xed, opcode] }] };
  }
  return {
    size: 2,
    fragments: [
      { kind: 'bytes', bytes: [0xd3] },
      {
        kind: 'port8',
        expression: port.expression,
        message: 'out (n),a expects an imm8 port number',
      },
    ],
  };
}

function imOpcode(mode: 0 | 1 | 2): number {
  switch (mode) {
    case 0:
      return 0x46;
    case 1:
      return 0x56;
    case 2:
      return 0x5e;
  }
}

function rstOpcode(vector: Z80RstVector): number {
  switch (vector) {
    case 0:
      return 0xc7;
    case 8:
      return 0xcf;
    case 16:
      return 0xd7;
    case 24:
      return 0xdf;
    case 32:
      return 0xe7;
    case 40:
      return 0xef;
    case 48:
      return 0xf7;
    case 56:
      return 0xff;
    default:
      throw new Error(`invalid RST vector: ${vector}`);
  }
}

function encodeIncDec(
  mnemonic: 'inc' | 'dec',
  operand: Extract<Z80Instruction, { readonly mnemonic: 'inc' | 'dec' }>['operand'],
): EncodedZ80Instruction {
  if (operand.kind === 'reg8') {
    return {
      size: 1,
      fragments: [
        {
          kind: 'bytes',
          bytes: [incDecBase(mnemonic).reg8 + register8Code(operand.register) * 8],
        },
      ],
    };
  }

  if (operand.kind === 'reg16') {
    const bytes = incDecRegister16Opcode(mnemonic, operand.register);
    return { size: bytes.length, fragments: [{ kind: 'bytes', bytes }] };
  }

  if (operand.kind === 'reg-half-index') {
    const bytes = incDecHalfIndexOpcode(mnemonic, operand.register);
    return { size: bytes.length, fragments: [{ kind: 'bytes', bytes }] };
  }

  if (operand.kind === 'indexed') {
    return {
      size: 3,
      fragments: [
        { kind: 'bytes', bytes: [indexPrefix(operand.register), incDecBase(mnemonic).memHl] },
        { kind: 'disp8', expression: operand.displacement },
      ],
    };
  }

  return {
    size: 1,
    fragments: [{ kind: 'bytes', bytes: [incDecBase(mnemonic).memHl] }],
  };
}

function incDecBase(mnemonic: 'inc' | 'dec'): { readonly reg8: number; readonly memHl: number } {
  return mnemonic === 'inc' ? { reg8: 0x04, memHl: 0x34 } : { reg8: 0x05, memHl: 0x35 };
}

function incDecRegister16Opcode(
  mnemonic: 'inc' | 'dec',
  register: Z80Register16 | Z80IndexRegister16,
): readonly number[] {
  const base = mnemonic === 'inc' ? 0x03 : 0x0b;
  switch (register) {
    case 'bc':
      return [base];
    case 'de':
      return [base + 0x10];
    case 'hl':
      return [base + 0x20];
    case 'sp':
      return [base + 0x30];
    case 'ix':
      return [0xdd, base + 0x20];
    case 'iy':
      return [0xfd, base + 0x20];
  }
}

function incDecHalfIndexOpcode(
  mnemonic: 'inc' | 'dec',
  register: Z80IndexHalfRegister,
): readonly number[] {
  const lowOpcode = mnemonic === 'inc' ? 0x2c : 0x2d;
  const highOpcode = mnemonic === 'inc' ? 0x24 : 0x25;
  switch (register) {
    case 'ixh':
      return [0xdd, highOpcode];
    case 'ixl':
      return [0xdd, lowOpcode];
    case 'iyh':
      return [0xfd, highOpcode];
    case 'iyl':
      return [0xfd, lowOpcode];
  }
}

function encodeStack(
  mnemonic: 'push' | 'pop',
  register: Z80StackRegister16,
): EncodedZ80Instruction {
  const bytes = stackOpcode(mnemonic, register);
  return { size: bytes.length, fragments: [{ kind: 'bytes', bytes }] };
}

function encodeBitLike(
  mnemonic: Z80BitMnemonic,
  bit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
  operand:
    | { readonly kind: 'reg8'; readonly register: Z80Register8 }
    | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
    | Extract<Z80Operand, { readonly kind: 'indexed' }>,
  destination?: { readonly kind: 'reg8'; readonly register: Z80Register8 },
): EncodedZ80Instruction {
  const operandCode = destination ? register8Code(destination.register) : cbOperandCode(operand);
  const opcode = bitLikeOpcodeBase(mnemonic) + bit * 8 + operandCode;
  return operand.kind === 'indexed'
    ? indexedCbInstruction(operand, opcode, mnemonic)
    : cbInstruction(opcode);
}

function encodeRotateShift(
  mnemonic: Z80RotateShiftMnemonic,
  operand:
    | { readonly kind: 'reg8'; readonly register: Z80Register8 }
    | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
    | Extract<Z80Operand, { readonly kind: 'indexed' }>,
  destination?: { readonly kind: 'reg8'; readonly register: Z80Register8 },
): EncodedZ80Instruction {
  const operandCode = destination ? register8Code(destination.register) : cbOperandCode(operand);
  const opcode = rotateShiftOpcodeBase(mnemonic) + operandCode;
  return operand.kind === 'indexed'
    ? indexedCbInstruction(operand, opcode, mnemonic)
    : cbInstruction(opcode);
}

function cbInstruction(opcode: number): EncodedZ80Instruction {
  return {
    size: 2,
    fragments: [{ kind: 'bytes', bytes: [0xcb, opcode] }],
  };
}

function indexedCbInstruction(
  operand: Extract<Z80Operand, { readonly kind: 'indexed' }>,
  opcode: number,
  mnemonic: string,
): EncodedZ80Instruction {
  return {
    size: 4,
    fragments: [
      { kind: 'bytes', bytes: [indexPrefix(operand.register), 0xcb] },
      {
        kind: 'disp8',
        expression: operand.displacement,
        message: `${mnemonic} (ix/iy+disp) expects disp8`,
      },
      { kind: 'bytes', bytes: [opcode] },
    ],
  };
}

function bitLikeOpcodeBase(mnemonic: Z80BitMnemonic): number {
  switch (mnemonic) {
    case 'bit':
      return 0x40;
    case 'res':
      return 0x80;
    case 'set':
      return 0xc0;
  }
}

function rotateShiftOpcodeBase(mnemonic: Z80RotateShiftMnemonic): number {
  switch (mnemonic) {
    case 'rlc':
      return 0x00;
    case 'rrc':
      return 0x08;
    case 'rl':
      return 0x10;
    case 'rr':
      return 0x18;
    case 'sla':
      return 0x20;
    case 'sra':
      return 0x28;
    case 'sll':
    case 'sls':
      return 0x30;
    case 'srl':
      return 0x38;
  }
}

function cbOperandCode(
  operand:
    | { readonly kind: 'reg8'; readonly register: Z80Register8 }
    | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
    | Extract<Z80Operand, { readonly kind: 'indexed' }>,
): number {
  return operand.kind === 'reg8' ? register8Code(operand.register) : 0x06;
}

function stackOpcode(mnemonic: 'push' | 'pop', register: Z80StackRegister16): readonly number[] {
  const base = mnemonic === 'push' ? 0xc5 : 0xc1;
  switch (register) {
    case 'bc':
      return [base];
    case 'de':
      return [base + 0x10];
    case 'hl':
      return [base + 0x20];
    case 'af':
      return [base + 0x30];
    case 'ix':
      return [0xdd, base + 0x20];
    case 'iy':
      return [0xfd, base + 0x20];
  }
}

function encode16BitAlu(
  mnemonic: 'add' | 'adc' | 'sbc',
  target: Z80Register16 | Z80IndexRegister16,
  source: Z80Register16 | Z80IndexRegister16,
): EncodedZ80Instruction {
  if ((target === 'ix' || target === 'iy') && mnemonic !== 'add') {
    throw new Error(`unsupported indexed ${mnemonic.toUpperCase()} target: ${target}`);
  }
  const opcode =
    target === 'ix' || target === 'iy'
      ? indexedAddOpcode(target, source)
      : hlAluOpcode(mnemonic, source as Z80Register16);
  return {
    size: opcode.length,
    fragments: [{ kind: 'bytes', bytes: opcode }],
  };
}

function indexedAddOpcode(
  target: Z80IndexRegister16,
  source: Z80Register16 | Z80IndexRegister16,
): readonly number[] {
  const prefix = indexPrefix(target);
  switch (source) {
    case 'bc':
      return [prefix, 0x09];
    case 'de':
      return [prefix, 0x19];
    case 'sp':
      return [prefix, 0x39];
    case 'ix':
      if (target === 'ix') {
        return [prefix, 0x29];
      }
      break;
    case 'iy':
      if (target === 'iy') {
        return [prefix, 0x29];
      }
      break;
  }
  throw new Error(`unsupported indexed ADD source: ${source}`);
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

  if (source.kind === 'reg-half-index') {
    return {
      size: 2,
      fragments: [
        {
          kind: 'bytes',
          bytes: [
            halfIndexPrefix(source, source),
            opcodes.registerBase + halfIndexRegisterCode(source.register),
          ],
        },
      ],
    };
  }

  if (source.kind === 'reg-indirect' && source.register === 'hl') {
    return { size: 1, fragments: [{ kind: 'bytes', bytes: [opcodes.memHl] }] };
  }

  if (source.kind === 'indexed') {
    return {
      size: 3,
      fragments: [
        { kind: 'bytes', bytes: [indexPrefix(source.register), opcodes.memHl] },
        { kind: 'disp8', expression: source.displacement },
      ],
    };
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

const LD_UNSUPPORTED_FORM_MESSAGE =
  'ld expects a supported register/memory/immediate transfer form';

function encodeLd(target: Z80Operand, source: Z80Operand): EncodedZ80Instruction {
  const legacyReg16Pair = encodeLegacyReg16ByteTransferLd(target, source);
  if (legacyReg16Pair) {
    return legacyReg16Pair;
  }

  const specialRegisterLd = encodeSpecialRegisterLd(target, source);
  if (specialRegisterLd) {
    return specialRegisterLd;
  }

  if (target.kind === 'reg8' && source.kind === 'imm') {
    return {
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [0x06 + register8Code(target.register) * 8] },
        {
          kind: 'imm8',
          expression: source.expression,
          failureMessage: LD_UNSUPPORTED_FORM_MESSAGE,
        },
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

  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'mem-abs') {
    return absoluteLd(0x3a, source.expression);
  }

  if (target.kind === 'mem-abs' && source.kind === 'reg8' && source.register === 'a') {
    return absoluteLd(0x32, target.expression);
  }

  if (
    (target.kind === 'reg8' || target.kind === 'reg-half-index') &&
    (source.kind === 'reg8' || source.kind === 'reg-half-index') &&
    isEncodableHalfIndexLd(target, source)
  ) {
    const prefix = halfIndexPrefix(target, source);
    return {
      size: 2,
      fragments: [
        {
          kind: 'bytes',
          bytes: [prefix, 0x40 + byteRegisterCode(target) * 8 + byteRegisterCode(source)],
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

  if (target.kind === 'reg-index16' && source.kind === 'imm') {
    return {
      size: 4,
      fragments: [
        { kind: 'bytes', bytes: [indexPrefix(target.register), 0x21] },
        { kind: 'abs16', expression: source.expression },
      ],
    };
  }

  if (
    target.kind === 'reg16' &&
    target.register === 'sp' &&
    ((source.kind === 'reg16' && source.register === 'hl') || source.kind === 'reg-index16')
  ) {
    return {
      size: source.kind === 'reg-index16' ? 2 : 1,
      fragments: [{ kind: 'bytes', bytes: loadSpOpcode(source.register) }],
    };
  }

  if (target.kind === 'reg16' && source.kind === 'mem-abs') {
    return absoluteRegister16Load(target.register, source.expression);
  }

  if (target.kind === 'reg-index16' && source.kind === 'mem-abs') {
    return prefixedAbsoluteLd(indexPrefix(target.register), 0x2a, source.expression);
  }

  if (target.kind === 'mem-abs' && source.kind === 'reg16') {
    return absoluteRegister16Store(source.register, target.expression);
  }

  if (target.kind === 'mem-abs' && source.kind === 'reg-index16') {
    return prefixedAbsoluteLd(indexPrefix(source.register), 0x22, target.expression);
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

  if (target.kind === 'reg8' && source.kind === 'indexed') {
    return {
      size: 3,
      fragments: [
        {
          kind: 'bytes',
          bytes: [indexPrefix(source.register), 0x46 + register8Code(target.register) * 8],
        },
        {
          kind: 'disp8',
          expression: source.displacement,
          message: 'ld (ix/iy+disp) expects disp8',
        },
      ],
    };
  }

  if (target.kind === 'indexed' && source.kind === 'reg8') {
    return {
      size: 3,
      fragments: [
        {
          kind: 'bytes',
          bytes: [indexPrefix(target.register), 0x70 + register8Code(source.register)],
        },
        {
          kind: 'disp8',
          expression: target.displacement,
          message: 'ld (ix/iy+disp) expects disp8',
        },
      ],
    };
  }

  if (target.kind === 'indexed' && source.kind === 'imm') {
    return {
      size: 4,
      fragments: [
        { kind: 'bytes', bytes: [indexPrefix(target.register), 0x36] },
        {
          kind: 'disp8',
          expression: target.displacement,
          message: 'ld (ix/iy+disp), n expects disp8',
        },
        {
          kind: 'imm8',
          expression: source.expression,
          failureMessage: LD_UNSUPPORTED_FORM_MESSAGE,
        },
      ],
    };
  }

  return {
    size: 0,
    fragments: [],
  };
}

function encodeLegacyReg16ByteTransferLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg16' || source.kind !== 'reg16') {
    return undefined;
  }

  const transfers = legacyReg16ByteTransferOpcodes(target.register, source.register);
  if (!transfers) {
    return undefined;
  }

  return {
    size: transfers.length,
    fragments: [{ kind: 'bytes', bytes: transfers }],
  };
}

function legacyReg16ByteTransferOpcodes(
  target: Z80Register16,
  source: Z80Register16,
): readonly number[] | undefined {
  if (target === 'hl' && source === 'de') {
    return [0x62, 0x6b];
  }
  if (target === 'bc' && source === 'de') {
    return [0x42, 0x4b];
  }
  return undefined;
}

function encodeSpecialRegisterLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind === 'special8' && source.kind === 'reg8' && source.register === 'a') {
    return {
      size: 2,
      fragments: [{ kind: 'bytes', bytes: [0xed, target.register === 'i' ? 0x47 : 0x4f] }],
    };
  }

  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'special8') {
    return {
      size: 2,
      fragments: [{ kind: 'bytes', bytes: [0xed, source.register === 'i' ? 0x57 : 0x5f] }],
    };
  }

  return undefined;
}

function absoluteLd(opcode: number, expression: Z80InstructionTarget): EncodedZ80Instruction {
  return {
    size: 3,
    fragments: [
      { kind: 'bytes', bytes: [opcode] },
      { kind: 'abs16', expression },
    ],
  };
}

function prefixedAbsoluteLd(
  prefix: number,
  opcode: number,
  expression: Z80InstructionTarget,
): EncodedZ80Instruction {
  return {
    size: 4,
    fragments: [
      { kind: 'bytes', bytes: [prefix, opcode] },
      { kind: 'abs16', expression },
    ],
  };
}

function absoluteRegister16Load(
  register: Z80Register16,
  expression: Z80InstructionTarget,
): EncodedZ80Instruction {
  switch (register) {
    case 'hl':
      return absoluteLd(0x2a, expression);
    case 'bc':
      return prefixedAbsoluteLd(0xed, 0x4b, expression);
    case 'de':
      return prefixedAbsoluteLd(0xed, 0x5b, expression);
    case 'sp':
      return prefixedAbsoluteLd(0xed, 0x7b, expression);
  }
}

function absoluteRegister16Store(
  register: Z80Register16,
  expression: Z80InstructionTarget,
): EncodedZ80Instruction {
  switch (register) {
    case 'hl':
      return absoluteLd(0x22, expression);
    case 'bc':
      return prefixedAbsoluteLd(0xed, 0x43, expression);
    case 'de':
      return prefixedAbsoluteLd(0xed, 0x53, expression);
    case 'sp':
      return prefixedAbsoluteLd(0xed, 0x73, expression);
  }
}

function indexPrefix(register: 'ix' | 'iy'): number {
  return register === 'ix' ? 0xdd : 0xfd;
}

function loadSpOpcode(register: Z80Register16 | Z80IndexRegister16): readonly number[] {
  switch (register) {
    case 'hl':
      return [0xf9];
    case 'ix':
      return [0xdd, 0xf9];
    case 'iy':
      return [0xfd, 0xf9];
    default:
      throw new Error(`unsupported LD SP source register: ${register}`);
  }
}

function halfIndexPrefix(target: Z80Operand, source: Z80Operand): number {
  const register =
    target.kind === 'reg-half-index'
      ? target.register
      : source.kind === 'reg-half-index'
        ? source.register
        : undefined;
  if (!register) {
    throw new Error('expected half-index register');
  }
  return register.startsWith('ix') ? 0xdd : 0xfd;
}

function isEncodableHalfIndexLd(target: Z80Operand, source: Z80Operand): boolean {
  if (target.kind !== 'reg-half-index' && source.kind !== 'reg-half-index') {
    return false;
  }
  return (
    isSameHalfIndexFamily(target, source) &&
    isHalfIndexCompatibleByteOperand(target) &&
    isHalfIndexCompatibleByteOperand(source)
  );
}

function isSameHalfIndexFamily(target: Z80Operand, source: Z80Operand): boolean {
  const targetFamily = halfIndexFamily(target);
  const sourceFamily = halfIndexFamily(source);
  return !targetFamily || !sourceFamily || targetFamily === sourceFamily;
}

function halfIndexFamily(operand: Z80Operand): 'ix' | 'iy' | undefined {
  if (operand.kind !== 'reg-half-index') {
    return undefined;
  }
  return operand.register.startsWith('ix') ? 'ix' : 'iy';
}

function isHalfIndexCompatibleByteOperand(operand: Z80Operand): boolean {
  return (
    operand.kind === 'reg-half-index' ||
    (operand.kind === 'reg8' && operand.register !== 'h' && operand.register !== 'l')
  );
}

function byteRegisterCode(
  operand: Extract<Z80Operand, { readonly kind: 'reg8' | 'reg-half-index' }>,
): number {
  return operand.kind === 'reg8'
    ? register8Code(operand.register)
    : halfIndexRegisterCode(operand.register);
}

function halfIndexRegisterCode(register: Z80IndexHalfRegister): number {
  switch (register) {
    case 'ixh':
    case 'iyh':
      return 4;
    case 'ixl':
    case 'iyl':
      return 5;
  }
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

function jumpIndirect(register: Z80JumpIndirectRegister): EncodedZ80Instruction {
  switch (register) {
    case 'hl':
      return { size: 1, fragments: [{ kind: 'bytes', bytes: [0xe9] }] };
    case 'ix':
      return { size: 2, fragments: [{ kind: 'bytes', bytes: [0xdd, 0xe9] }] };
    case 'iy':
      return { size: 2, fragments: [{ kind: 'bytes', bytes: [0xfd, 0xe9] }] };
  }
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

function conditionCode(condition: Z80Condition): number {
  switch (condition) {
    case 'nz':
      return 0;
    case 'z':
      return 1;
    case 'nc':
      return 2;
    case 'c':
      return 3;
    case 'po':
      return 4;
    case 'pe':
      return 5;
    case 'p':
      return 6;
    case 'm':
      return 7;
  }
}

function retConditionOpcode(condition: Z80Condition): number {
  return 0xc0 + conditionCode(condition) * 8;
}

function jpConditionOpcode(condition: Z80Condition): number {
  return 0xc2 + conditionCode(condition) * 8;
}

function callConditionOpcode(condition: Z80Condition): number {
  return 0xc4 + conditionCode(condition) * 8;
}

function jrConditionOpcode(condition: Z80RelativeCondition): number {
  return 0x20 + conditionCode(condition) * 8;
}
