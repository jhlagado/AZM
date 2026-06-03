import type { Z80Operand, Z80Register16 } from './instruction.js';

type LdSupportPredicate = (target: Z80Operand, source: Z80Operand) => boolean;

const LD_SUPPORT_PREDICATES: readonly LdSupportPredicate[] = [
  isSupportedSpecialRegisterLd,
  isSupportedHalfIndexLd,
  isReg8Ld,
  isIndexedByteLd,
  isReg16ImmediateLd,
  isLegacyReg16Ld,
  isIndex16ImmediateLd,
  isStackPointerRegisterLd,
  isRegisterFromAbsoluteMemoryLd,
  isAbsoluteMemoryFromRegisterLd,
  isAccumulatorFromRegisterIndirectLd,
  isRegisterIndirectFromAccumulatorLd,
  isHlIndirectByteLd,
  isByteFromHlIndirectLd,
];

export function isSupportedLd(target: Z80Operand, source: Z80Operand): boolean {
  return LD_SUPPORT_PREDICATES.some((predicate) => predicate(target, source));
}

export function unsupportedLdReason(target: Z80Operand, source: Z80Operand): string | undefined {
  if (isMemoryOperand(target) && isMemoryOperand(source)) {
    return 'ld does not support memory-to-memory transfers';
  }

  const halfIndexReason = unsupportedHalfIndexLdReason(target, source);
  if (halfIndexReason) {
    return halfIndexReason;
  }

  return unsupportedRegisterPairLdReason(target, source);
}

function isReg8Ld(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg8' && (source.kind === 'reg8' || source.kind === 'imm');
}

function isIndexedByteLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    (target.kind === 'reg8' && source.kind === 'indexed') ||
    (target.kind === 'indexed' && (source.kind === 'reg8' || source.kind === 'imm'))
  );
}

function isReg16ImmediateLd(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg16' && source.kind === 'imm';
}

function isLegacyReg16Ld(target: Z80Operand, source: Z80Operand): boolean {
  return (
    target.kind === 'reg16' &&
    source.kind === 'reg16' &&
    isLegacyReg16ByteTransferPair(target.register, source.register)
  );
}

function isIndex16ImmediateLd(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg-index16' && source.kind === 'imm';
}

function isStackPointerRegisterLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    target.kind === 'reg16' &&
    target.register === 'sp' &&
    (source.kind === 'reg16' || source.kind === 'reg-index16') &&
    (source.register === 'hl' || source.register === 'ix' || source.register === 'iy')
  );
}

function isRegisterFromAbsoluteMemoryLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    (target.kind === 'reg8' || target.kind === 'reg16' || target.kind === 'reg-index16') &&
    source.kind === 'mem-abs' &&
    (target.kind !== 'reg8' || target.register === 'a')
  );
}

function isAbsoluteMemoryFromRegisterLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    target.kind === 'mem-abs' &&
    (source.kind === 'reg16' ||
      source.kind === 'reg-index16' ||
      (source.kind === 'reg8' && source.register === 'a'))
  );
}

function isAccumulatorFromRegisterIndirectLd(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg8' && target.register === 'a' && source.kind === 'reg-indirect';
}

function isRegisterIndirectFromAccumulatorLd(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg-indirect' && source.kind === 'reg8' && source.register === 'a';
}

function isHlIndirectByteLd(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg-indirect' && target.register === 'hl' && (source.kind === 'reg8' || source.kind === 'imm');
}

function isByteFromHlIndirectLd(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg8' && source.kind === 'reg-indirect' && source.register === 'hl';
}

function isLegacyReg16ByteTransferPair(target: Z80Register16, source: Z80Register16): boolean {
  return (target === 'hl' && source === 'de') || (target === 'bc' && source === 'de');
}

function isSupportedSpecialRegisterLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    (target.kind === 'special8' && source.kind === 'reg8' && source.register === 'a') ||
    (target.kind === 'reg8' && target.register === 'a' && source.kind === 'special8')
  );
}

function isMemoryOperand(operand: Z80Operand): boolean {
  return operand.kind === 'reg-indirect' || operand.kind === 'indexed' || operand.kind === 'mem-abs';
}

function isSupportedHalfIndexLd(target: Z80Operand, source: Z80Operand): boolean {
  return (
    hasHalfIndexRegister(target, source) &&
    isSameIndexHalfFamily(target, source) &&
    !usesPlainHlCounterpart(target, source) &&
    isHalfIndexCompatibleByteOperand(target) &&
    isHalfIndexCompatibleByteOperand(source)
  );
}

function unsupportedHalfIndexLdReason(target: Z80Operand, source: Z80Operand): string | undefined {
  if (!hasHalfIndexRegister(target, source)) {
    return undefined;
  }
  if (!isSameIndexHalfFamily(target, source)) {
    return 'ld between IX* and IY* byte registers is not supported';
  }
  return usesPlainHlCounterpart(target, source)
    ? 'ld with IX*/IY* does not support plain H/L counterpart operands'
    : undefined;
}

function unsupportedRegisterPairLdReason(target: Z80Operand, source: Z80Operand): string | undefined {
  if (isUnsupportedIndexPairLd(target, source)) {
    return 'ld rr, rr supports SP <- HL/IX/IY only';
  }

  if (!isRegisterPairLdReasonCandidate(target, source)) {
    return undefined;
  }

  return isSupportedRegisterPairLd(target, source)
    ? undefined
    : 'ld rr, rr supports SP <- HL/IX/IY only';
}

function isUnsupportedIndexPairLd(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg-index16' && source.kind === 'reg-index16' && target.register !== source.register;
}

function isRegisterPairLdReasonCandidate(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg16' && source.kind !== 'imm' && (source.kind === 'reg16' || source.kind === 'reg-index16');
}

function isSupportedRegisterPairLd(target: Z80Operand, source: Z80Operand): boolean {
  return isStackPointerRegisterLd(target, source) || isLegacyReg16Ld(target, source);
}

function hasHalfIndexRegister(target: Z80Operand, source: Z80Operand): boolean {
  return target.kind === 'reg-half-index' || source.kind === 'reg-half-index';
}

function isSameIndexHalfFamily(target: Z80Operand, source: Z80Operand): boolean {
  const targetFamily = indexHalfFamily(target);
  const sourceFamily = indexHalfFamily(source);
  return !targetFamily || !sourceFamily || targetFamily === sourceFamily;
}

function indexHalfFamily(operand: Z80Operand): 'ix' | 'iy' | undefined {
  return operand.kind === 'reg-half-index' ? (operand.register.startsWith('ix') ? 'ix' : 'iy') : undefined;
}

function usesPlainHlCounterpart(target: Z80Operand, source: Z80Operand): boolean {
  return (
    (target.kind === 'reg-half-index' && isPlainHlReg8(source)) ||
    (source.kind === 'reg-half-index' && isPlainHlReg8(target))
  );
}

function isPlainHlReg8(operand: Z80Operand): boolean {
  return operand.kind === 'reg8' && (operand.register === 'h' || operand.register === 'l');
}

function isHalfIndexCompatibleByteOperand(operand: Z80Operand): boolean {
  return (
    operand.kind === 'reg-half-index' ||
    (operand.kind === 'reg8' && operand.register !== 'h' && operand.register !== 'l')
  );
}
