import { isSupportedLd, unsupportedLdReason } from './ld-support.js';
import { splitInstructionOperands } from './operand-split.js';
import type { ParseZ80InstructionResult } from './parse-instruction.js';
import type { Z80Operand } from './instruction.js';
import {
  indexedBracketError,
  invalidLdOperandDiagnostics,
  parseLdOperand,
} from './parse-operands.js';

export function parseLdInstruction(text: string): ParseZ80InstructionResult | undefined {
  const ld = /^LD\s+(.+)$/i.exec(text);
  if (ld) {
    return parseLdOperands(ld[1] ?? '');
  }
  return undefined;
}

function parseLdOperands(operandText: string): ParseZ80InstructionResult {
  const parts = splitInstructionOperands(operandText);
  if (parts.length !== 2) {
    return { error: 'ld expects two operands' };
  }
  return parseLdOperandTexts(parts[0] ?? '', parts[1] ?? '');
}

function parseLdOperandTexts(leftText: string, rightText: string): ParseZ80InstructionResult {
  const indexedBracket = indexedBracketError(leftText) ?? indexedBracketError(rightText);
  if (indexedBracket) {
    return { error: indexedBracket };
  }
  if (/^AF$/i.test(leftText) || /^AF$/i.test(rightText)) {
    return { error: 'ld does not support AF in this form' };
  }
  const operands = parseLdOperandPair(leftText, rightText);
  if ('error' in operands) return operands;
  const formError = ldFormError(operands.target, operands.source);
  if (formError) return { error: formError };
  const { target, source } = operands;
  return { instruction: { mnemonic: 'ld', target, source } };
}

function parseLdOperandPair(
  leftText: string,
  rightText: string,
):
  | { readonly target: Z80Operand; readonly source: Z80Operand }
  | { readonly error: string; readonly diagnostics?: readonly string[] } {
  const target = parseLdOperand(leftText);
  const source = parseLdOperand(rightText);
  if (target && source) {
    return { target, source };
  }
  const operandDiagnostics = [
    ...invalidLdOperandDiagnostics(leftText),
    ...invalidLdOperandDiagnostics(rightText),
  ];
  if (operandDiagnostics.length > 0) {
    return {
      error: operandDiagnostics[operandDiagnostics.length - 1]!,
      diagnostics: operandDiagnostics,
    };
  }
  return { error: 'ld expects a supported register/memory/immediate transfer form' };
}

function ldFormError(target: Z80Operand, source: Z80Operand): string | undefined {
  return (
    ldRegisterIndirectFormError(target, source) ??
    ldHalfIndexFormError(target, source) ??
    unsupportedLdReason(target, source) ??
    unsupportedLdFormError(target, source)
  );
}

function ldRegisterIndirectFormError(target: Z80Operand, source: Z80Operand): string | undefined {
  if (
    target.kind === 'reg8' &&
    target.register !== 'a' &&
    source.kind === 'reg-indirect' &&
    source.register !== 'hl'
  ) {
    return 'ld r8, (bc/de) supports destination A only';
  }
  if (
    target.kind === 'reg-indirect' &&
    source.kind === 'reg8' &&
    source.register !== 'a' &&
    target.register !== 'hl'
  ) {
    return 'ld (bc/de), r8 supports source A only';
  }
  return undefined;
}

function ldHalfIndexFormError(target: Z80Operand, source: Z80Operand): string | undefined {
  return target.kind === 'reg-half-index' && source.kind === 'reg-indirect'
    ? `ld ${target.register.toUpperCase()}, source expects (ix+disp)`
    : undefined;
}

function unsupportedLdFormError(target: Z80Operand, source: Z80Operand): string | undefined {
  return isSupportedLd(target, source)
    ? undefined
    : 'ld expects a supported register/memory/immediate transfer form';
}
