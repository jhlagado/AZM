import type { EncodedZ80Instruction, Z80Operand, Z80Register16 } from './instruction.js';
import {
  absoluteLd,
  absoluteRegister16Load,
  absoluteRegister16Store,
  byteRegisterCode,
  halfIndexPrefix,
  indexPrefix,
  isHalfIndexTransferLd,
  isLoadSpFromWordRegister,
  loadAFromIndirectOpcode,
  loadSpOpcode,
  oneByteInstruction,
  prefixedAbsoluteLd,
  register16Code,
  register8Code,
  storeAToIndirectOpcode,
  type HalfIndexLdOperand,
  type LoadSpSourceOperand,
} from './encode-ld-helpers.js';

const LD_UNSUPPORTED_FORM_MESSAGE =
  'ld expects a supported register/memory/immediate transfer form';

type LdEncoder = (target: Z80Operand, source: Z80Operand) => EncodedZ80Instruction | undefined;

const BYTE_REGISTER_LD_ENCODERS: readonly LdEncoder[] = [
  encodeReg8ImmediateLd,
  encodeReg8RegisterLd,
  encodeLoadAFromAbsoluteLd,
  encodeStoreAToAbsoluteLd,
  encodeHalfIndexTransferLd,
];

const WORD_REGISTER_LD_ENCODERS: readonly LdEncoder[] = [
  encodeReg16ImmediateLd,
  encodeIndex16ImmediateLd,
  encodeLoadSpFromWordRegisterLd,
  encodeAbsoluteRegister16LoadLd,
  encodeAbsoluteIndex16LoadLd,
  encodeAbsoluteRegister16StoreLd,
  encodeAbsoluteIndex16StoreLd,
];

const HL_INDIRECT_LD_ENCODERS: readonly LdEncoder[] = [
  encodeStoreReg8ToHlLd,
  encodeStoreImmToHlLd,
  encodeLoadReg8FromHlLd,
];

export function encodeLd(target: Z80Operand, source: Z80Operand): EncodedZ80Instruction {
  const encoded =
    encodeLegacyReg16ByteTransferLd(target, source) ??
    encodeSpecialRegisterLd(target, source) ??
    firstLdEncoding(BYTE_REGISTER_LD_ENCODERS, target, source) ??
    firstLdEncoding(WORD_REGISTER_LD_ENCODERS, target, source) ??
    encodeAccumulatorIndirectLd(target, source) ??
    firstLdEncoding(HL_INDIRECT_LD_ENCODERS, target, source) ??
    encodeIndexedLd(target, source);
  if (encoded) return encoded;

  return {
    size: 0,
    fragments: [],
  };
}

function firstLdEncoding(
  encoders: readonly LdEncoder[],
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  for (const encoder of encoders) {
    const encoded = encoder(target, source);
    if (encoded) return encoded;
  }
  return undefined;
}

function encodeReg8ImmediateLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg8' || source.kind !== 'imm') return undefined;
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

function encodeReg8RegisterLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg8' || source.kind !== 'reg8') return undefined;
  return oneByteInstruction(
    0x40 + register8Code(target.register) * 8 + register8Code(source.register),
  );
}

function encodeLoadAFromAbsoluteLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg8' || target.register !== 'a' || source.kind !== 'mem-abs') {
    return undefined;
  }
  return absoluteLd(0x3a, source.expression);
}

function encodeStoreAToAbsoluteLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'mem-abs' || source.kind !== 'reg8' || source.register !== 'a') {
    return undefined;
  }
  return absoluteLd(0x32, target.expression);
}

function encodeHalfIndexTransferLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (!isHalfIndexTransferLd(target, source)) return undefined;
  const ldTarget = target as HalfIndexLdOperand;
  const ldSource = source as HalfIndexLdOperand;
  const prefix = halfIndexPrefix(ldTarget, ldSource);
  return {
    size: 2,
    fragments: [
      {
        kind: 'bytes',
        bytes: [prefix, 0x40 + byteRegisterCode(ldTarget) * 8 + byteRegisterCode(ldSource)],
      },
    ],
  };
}

function encodeReg16ImmediateLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg16' || source.kind !== 'imm') return undefined;
  return {
    size: 3,
    fragments: [
      { kind: 'bytes', bytes: [0x01 + register16Code(target.register) * 0x10] },
      { kind: 'abs16', expression: source.expression },
    ],
  };
}

function encodeIndex16ImmediateLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg-index16' || source.kind !== 'imm') return undefined;
  return {
    size: 4,
    fragments: [
      { kind: 'bytes', bytes: [indexPrefix(target.register), 0x21] },
      { kind: 'abs16', expression: source.expression },
    ],
  };
}

function encodeLoadSpFromWordRegisterLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (!isLoadSpFromWordRegister(target, source)) return undefined;
  const ldSource = source as LoadSpSourceOperand;
  return {
    size: ldSource.kind === 'reg-index16' ? 2 : 1,
    fragments: [{ kind: 'bytes', bytes: loadSpOpcode(ldSource.register) }],
  };
}

function encodeAbsoluteRegister16LoadLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg16' || source.kind !== 'mem-abs') return undefined;
  return absoluteRegister16Load(target.register, source.expression);
}

function encodeAbsoluteIndex16LoadLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg-index16' || source.kind !== 'mem-abs') return undefined;
  return prefixedAbsoluteLd(indexPrefix(target.register), 0x2a, source.expression);
}

function encodeAbsoluteRegister16StoreLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'mem-abs' || source.kind !== 'reg16') return undefined;
  return absoluteRegister16Store(source.register, target.expression);
}

function encodeAbsoluteIndex16StoreLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'mem-abs' || source.kind !== 'reg-index16') return undefined;
  return prefixedAbsoluteLd(indexPrefix(source.register), 0x22, target.expression);
}

function encodeAccumulatorIndirectLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  return (
    encodeLoadAFromRegisterIndirectLd(target, source) ??
    encodeStoreAToRegisterIndirectLd(target, source)
  );
}

function encodeLoadAFromRegisterIndirectLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg8' || target.register !== 'a' || source.kind !== 'reg-indirect') {
    return undefined;
  }
  return oneByteInstruction(loadAFromIndirectOpcode(source.register));
}

function encodeStoreAToRegisterIndirectLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg-indirect' || source.kind !== 'reg8' || source.register !== 'a') {
    return undefined;
  }
  return oneByteInstruction(storeAToIndirectOpcode(target.register));
}

function encodeStoreReg8ToHlLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg-indirect' || target.register !== 'hl' || source.kind !== 'reg8') {
    return undefined;
  }
  return oneByteInstruction(0x70 + register8Code(source.register));
}

function encodeStoreImmToHlLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg-indirect' || target.register !== 'hl' || source.kind !== 'imm') {
    return undefined;
  }
  return {
    size: 2,
    fragments: [
      { kind: 'bytes', bytes: [0x36] },
      {
        kind: 'imm8',
        expression: source.expression,
        failureMessage: LD_UNSUPPORTED_FORM_MESSAGE,
      },
    ],
  };
}

function encodeLoadReg8FromHlLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg8' || source.kind !== 'reg-indirect' || source.register !== 'hl') {
    return undefined;
  }
  return oneByteInstruction(0x46 + register8Code(target.register) * 8);
}

function encodeIndexedLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  return (
    encodeLoadReg8FromIndexedLd(target, source) ??
    encodeStoreReg8ToIndexedLd(target, source) ??
    encodeStoreImmToIndexedLd(target, source)
  );
}

function encodeLoadReg8FromIndexedLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'reg8' || source.kind !== 'indexed') return undefined;
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

function encodeStoreReg8ToIndexedLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'indexed' || source.kind !== 'reg8') return undefined;
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

function encodeStoreImmToIndexedLd(
  target: Z80Operand,
  source: Z80Operand,
): EncodedZ80Instruction | undefined {
  if (target.kind !== 'indexed' || source.kind !== 'imm') return undefined;
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
  if (target === 'hl' && source === 'de') return [0x62, 0x6b];
  if (target === 'bc' && source === 'de') return [0x42, 0x4b];
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
