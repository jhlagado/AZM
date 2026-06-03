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
  Z80RotateShiftMnemonic,
  Z80RstVector,
  Z80StackRegister16,
} from './instruction.js';
import { encodeCore } from './encode-core.js';
import { encodeLd } from './encode-ld.js';

const ROTATE_SHIFT_OPCODE_BASES: Readonly<Record<Z80RotateShiftMnemonic, number>> = {
  rlc: 0x00,
  rrc: 0x08,
  rl: 0x10,
  rr: 0x18,
  sla: 0x20,
  sra: 0x28,
  sll: 0x30,
  sls: 0x30,
  srl: 0x38,
};

function oneByteInstruction(opcode: number): EncodedZ80Instruction {
  return { size: 1, fragments: [{ kind: 'bytes', bytes: [opcode] }] };
}

type Z80Mnemonic = Z80Instruction['mnemonic'];
type Z80Encoder = (instruction: Z80Instruction) => EncodedZ80Instruction;

const Z80_ENCODERS = {
  nop: () => oneByteInstruction(0x00),
  ret: () => oneByteInstruction(0xc9),
  'ret-cc': encodeRetConditionInstruction,
  di: encodeCoreInstruction,
  ei: encodeCoreInstruction,
  scf: encodeCoreInstruction,
  ccf: encodeCoreInstruction,
  cpl: encodeCoreInstruction,
  daa: encodeCoreInstruction,
  exx: encodeCoreInstruction,
  halt: encodeCoreInstruction,
  rlca: encodeCoreInstruction,
  rrca: encodeCoreInstruction,
  rla: encodeCoreInstruction,
  rra: encodeCoreInstruction,
  neg: encodeCoreInstruction,
  rrd: encodeCoreInstruction,
  rld: encodeCoreInstruction,
  ldi: encodeCoreInstruction,
  ldir: encodeCoreInstruction,
  ldd: encodeCoreInstruction,
  lddr: encodeCoreInstruction,
  cpi: encodeCoreInstruction,
  cpir: encodeCoreInstruction,
  cpd: encodeCoreInstruction,
  cpdr: encodeCoreInstruction,
  ini: encodeCoreInstruction,
  inir: encodeCoreInstruction,
  ind: encodeCoreInstruction,
  indr: encodeCoreInstruction,
  outi: encodeCoreInstruction,
  otir: encodeCoreInstruction,
  outd: encodeCoreInstruction,
  otdr: encodeCoreInstruction,
  reti: encodeCoreInstruction,
  retn: encodeCoreInstruction,
  ex: encodeExchangeInstruction,
  im: encodeInterruptModeInstruction,
  rst: encodeRstInstruction,
  inc: encodeIncDecInstruction,
  dec: encodeIncDecInstruction,
  push: encodeStackInstruction,
  pop: encodeStackInstruction,
  'ld-a-imm': encodeLdAImmediateInstruction,
  ld: encodeLdInstruction,
  in: encodeInInstruction,
  out: encodeOutInstruction,
  bit: encodeBitLikeInstruction,
  res: encodeBitLikeInstruction,
  set: encodeBitLikeInstruction,
  rlc: encodeRotateShiftInstruction,
  rrc: encodeRotateShiftInstruction,
  rl: encodeRotateShiftInstruction,
  rr: encodeRotateShiftInstruction,
  sla: encodeRotateShiftInstruction,
  sra: encodeRotateShiftInstruction,
  sll: encodeRotateShiftInstruction,
  sls: encodeRotateShiftInstruction,
  srl: encodeRotateShiftInstruction,
  add: encodeAluInstruction,
  adc: encodeAluInstruction,
  sub: encodeAluInstruction,
  sbc: encodeAluInstruction,
  and: encodeAluInstruction,
  or: encodeAluInstruction,
  xor: encodeAluInstruction,
  cp: encodeAluInstruction,
  jp: encodeJumpInstruction,
  'jp-cc': encodeConditionalJumpInstruction,
  'jp-indirect': encodeIndirectJumpInstruction,
  call: encodeCallInstruction,
  'call-cc': encodeConditionalCallInstruction,
  jr: encodeRelativeJumpInstruction,
  'jr-cc': encodeConditionalRelativeJumpInstruction,
  djnz: encodeDjnzInstruction,
} satisfies Record<Z80Mnemonic, Z80Encoder>;

export function encodeZ80Instruction(instruction: Z80Instruction): EncodedZ80Instruction {
  return Z80_ENCODERS[instruction.mnemonic](instruction);
}

function encodeRetConditionInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const ret = instruction as Extract<Z80Instruction, { readonly mnemonic: 'ret-cc' }>;
  return oneByteInstruction(retConditionOpcode(ret.condition));
}

function encodeCoreInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  return encodeCore(instruction.mnemonic as Z80CoreMnemonic);
}

function encodeExchangeInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const exchange = instruction as Extract<Z80Instruction, { readonly mnemonic: 'ex' }>;
  return encodeExchange(exchange.form);
}

function encodeInterruptModeInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const im = instruction as Extract<Z80Instruction, { readonly mnemonic: 'im' }>;
  return { size: 2, fragments: [{ kind: 'bytes', bytes: [0xed, imOpcode(im.mode)] }] };
}

function encodeRstInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const rst = instruction as Extract<Z80Instruction, { readonly mnemonic: 'rst' }>;
  return oneByteInstruction(rstOpcode(rst.vector));
}

function encodeIncDecInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const incDec = instruction as Extract<Z80Instruction, { readonly mnemonic: 'inc' | 'dec' }>;
  return encodeIncDec(incDec.mnemonic, incDec.operand);
}

function encodeStackInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const stack = instruction as Extract<Z80Instruction, { readonly mnemonic: 'push' | 'pop' }>;
  return encodeStack(stack.mnemonic, stack.register);
}

function encodeLdAImmediateInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const ldA = instruction as Extract<Z80Instruction, { readonly mnemonic: 'ld-a-imm' }>;
  return {
    size: 2,
    fragments: [
      { kind: 'bytes', bytes: [0x3e] },
      { kind: 'imm8', expression: ldA.expression },
    ],
  };
}

function encodeLdInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const ld = instruction as Extract<Z80Instruction, { readonly mnemonic: 'ld' }>;
  return encodeLd(ld.target, ld.source);
}

function encodeInInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const input = instruction as Extract<Z80Instruction, { readonly mnemonic: 'in' }>;
  return encodeIn(input.target, input.port);
}

function encodeOutInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const output = instruction as Extract<Z80Instruction, { readonly mnemonic: 'out' }>;
  return encodeOut(output.port, output.source);
}

function encodeBitLikeInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const bitLike = instruction as Extract<Z80Instruction, { readonly mnemonic: Z80BitMnemonic }>;
  return encodeBitLike(bitLike.mnemonic, bitLike.bit, bitLike.operand, bitLike.destination);
}

function encodeRotateShiftInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const rotateShift = instruction as Extract<
    Z80Instruction,
    { readonly mnemonic: Z80RotateShiftMnemonic }
  >;
  return encodeRotateShift(rotateShift.mnemonic, rotateShift.operand, rotateShift.destination);
}

function encodeAluInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const alu = instruction as Extract<Z80Instruction, { readonly mnemonic: Z80AluMnemonic }>;
  if ('target' in alu) {
    return encode16BitAlu(alu.mnemonic, alu.target.register, alu.source.register);
  }
  return encodeAlu(alu.mnemonic, alu.source);
}

function encodeJumpInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const jump = instruction as Extract<Z80Instruction, { readonly mnemonic: 'jp' }>;
  return absoluteTarget(0xc3, jump.expression);
}

function encodeConditionalJumpInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const jump = instruction as Extract<Z80Instruction, { readonly mnemonic: 'jp-cc' }>;
  return absoluteTarget(jpConditionOpcode(jump.condition), jump.expression);
}

function encodeIndirectJumpInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const jump = instruction as Extract<Z80Instruction, { readonly mnemonic: 'jp-indirect' }>;
  return jumpIndirect(jump.register);
}

function encodeCallInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const call = instruction as Extract<Z80Instruction, { readonly mnemonic: 'call' }>;
  return absoluteTarget(0xcd, call.expression);
}

function encodeConditionalCallInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const call = instruction as Extract<Z80Instruction, { readonly mnemonic: 'call-cc' }>;
  return absoluteTarget(callConditionOpcode(call.condition), call.expression);
}

function encodeRelativeJumpInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const jump = instruction as Extract<Z80Instruction, { readonly mnemonic: 'jr' }>;
  return relativeTarget(0x18, 'jr', jump.expression);
}

function encodeConditionalRelativeJumpInstruction(
  instruction: Z80Instruction,
): EncodedZ80Instruction {
  const jump = instruction as Extract<Z80Instruction, { readonly mnemonic: 'jr-cc' }>;
  return relativeTarget(jrConditionOpcode(jump.condition), `jr ${jump.condition}`, jump.expression);
}

function encodeDjnzInstruction(instruction: Z80Instruction): EncodedZ80Instruction {
  const djnz = instruction as Extract<Z80Instruction, { readonly mnemonic: 'djnz' }>;
  return relativeTarget(0x10, 'djnz', djnz.expression);
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
  return ROTATE_SHIFT_OPCODE_BASES[mnemonic];
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

function indexPrefix(register: 'ix' | 'iy'): number {
  return register === 'ix' ? 0xdd : 0xfd;
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
