import type {
  EncodedZ80Instruction,
  Z80IndexHalfRegister,
  Z80IndexRegister16,
  Z80Instruction,
  Z80Operand,
  Z80Register16,
  Z80Register8,
  Z80RegisterIndirect,
} from './instruction.js';

export type Z80InstructionTarget = Extract<
  Z80Instruction,
  { readonly expression: unknown }
>['expression'];
export type HalfIndexLdOperand = Extract<Z80Operand, { readonly kind: 'reg8' | 'reg-half-index' }>;
export type LoadSpSourceOperand = Extract<Z80Operand, { readonly kind: 'reg16' | 'reg-index16' }>;

export function absoluteLd(
  opcode: number,
  expression: Z80InstructionTarget,
): EncodedZ80Instruction {
  return {
    size: 3,
    fragments: [
      { kind: 'bytes', bytes: [opcode] },
      { kind: 'abs16', expression },
    ],
  };
}

export function prefixedAbsoluteLd(
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

export function absoluteRegister16Load(
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

export function absoluteRegister16Store(
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

export function isHalfIndexTransferLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    (target.kind === 'reg8' || target.kind === 'reg-half-index') &&
    (source.kind === 'reg8' || source.kind === 'reg-half-index') &&
    isEncodableHalfIndexLd(target, source)
  );
}

export function isLoadSpFromWordRegister(target: Z80Operand, source: Z80Operand): boolean {
  return (
    target.kind === 'reg16' &&
    target.register === 'sp' &&
    ((source.kind === 'reg16' && source.register === 'hl') || source.kind === 'reg-index16')
  );
}

export function loadSpOpcode(register: Z80Register16 | Z80IndexRegister16): readonly number[] {
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

export function halfIndexPrefix(target: HalfIndexLdOperand, source: HalfIndexLdOperand): number {
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

export function byteRegisterCode(operand: HalfIndexLdOperand): number {
  return operand.kind === 'reg8'
    ? register8Code(operand.register)
    : halfIndexRegisterCode(operand.register);
}

export function oneByteInstruction(opcode: number): EncodedZ80Instruction {
  return {
    size: 1,
    fragments: [{ kind: 'bytes', bytes: [opcode] }],
  };
}

export function indexPrefix(register: 'ix' | 'iy'): number {
  return register === 'ix' ? 0xdd : 0xfd;
}

export function register8Code(register: Z80Register8): number {
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

export function register16Code(register: Z80Register16): number {
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

export function loadAFromIndirectOpcode(register: Z80RegisterIndirect): number {
  switch (register) {
    case 'bc':
      return 0x0a;
    case 'de':
      return 0x1a;
    case 'hl':
      return 0x7e;
  }
}

export function storeAToIndirectOpcode(register: Z80RegisterIndirect): number {
  switch (register) {
    case 'bc':
      return 0x02;
    case 'de':
      return 0x12;
    case 'hl':
      return 0x77;
  }
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
