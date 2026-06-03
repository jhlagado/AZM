import type { Expression } from '../model/expression.js';
import type { Z80IndexRegister16, Z80Instruction } from '../z80/instruction.js';
import {
  evaluateLoweredConstant,
  formatExpression,
  formatLoweredNumber,
  type LoweredEvalContext,
} from './asm80-expressions.js';

export type LdOperand = Extract<Z80Instruction, { readonly mnemonic: 'ld' }>['target'];

export function formatLd(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  return (
    formatLdRegisterForm(target, source) ??
    formatLdImmediateOrAbsoluteLoad(target, source, evalContext) ??
    formatLdIndirectForm(target, source, evalContext) ??
    formatLdAbsoluteStore(target, source, evalContext)
  );
}

export function formatIndexedMemory(
  register: Z80IndexRegister16,
  displacement: Expression,
  evalContext: LoweredEvalContext,
): string | undefined {
  const value = evaluateLoweredConstant(displacement, evalContext);
  if (value === undefined) {
    return undefined;
  }
  const magnitude = formatLoweredNumber(Math.abs(value), 'byte');
  if (value === 0) {
    return `(${register}+$00)`;
  }
  if (value > 0) {
    return `(${register}+${magnitude})`;
  }
  return `(${register}-${magnitude})`;
}

function formatLdRegisterForm(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  return (
    formatLdReg8FromReg8(target, source) ??
    formatLdReg8FromHalfIndex(target, source) ??
    formatLdAFromSpecial8(target, source) ??
    formatLdSpecial8FromA(target, source)
  );
}

function formatLdReg8FromReg8(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && source.kind === 'reg8') {
    return { text: `ld ${target.register}, ${source.register}` };
  }
  return undefined;
}

function formatLdReg8FromHalfIndex(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && source.kind === 'reg-half-index') {
    return { text: `ld ${target.register}, ${source.register}` };
  }
  return undefined;
}

function formatLdAFromSpecial8(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'special8') {
    return { text: `ld a, ${source.register}` };
  }
  return undefined;
}

function formatLdSpecial8FromA(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  if (target.kind === 'special8' && source.kind === 'reg8' && source.register === 'a') {
    return { text: `ld ${target.register}, a` };
  }
  return undefined;
}

function formatLdImmediateOrAbsoluteLoad(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  return (
    formatLdReg8Immediate(target, source, evalContext) ??
    formatLdReg16Immediate(target, source, evalContext) ??
    formatLdIndex16Immediate(target, source, evalContext) ??
    formatLdReg16AbsoluteLoad(target, source, evalContext) ??
    formatLdReg8AbsoluteLoad(target, source, evalContext)
  );
}

function formatLdReg8Immediate(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && source.kind === 'imm') {
    return formatLdText(target.register, formatExpression(source.expression, evalContext, 'byte'));
  }
  return undefined;
}

function formatLdReg16Immediate(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind === 'reg16' && source.kind === 'imm') {
    return formatLdText(target.register, formatExpression(source.expression, evalContext, 'word'));
  }
  return undefined;
}

function formatLdIndex16Immediate(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind === 'reg-index16' && source.kind === 'imm') {
    return formatLdText(target.register, formatExpression(source.expression, evalContext, 'word'));
  }
  return undefined;
}

function formatLdReg16AbsoluteLoad(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind === 'reg16' && source.kind === 'mem-abs') {
    return formatLdText(
      target.register,
      formatParenthesizedExpression(source.expression, evalContext, 'auto'),
    );
  }
  return undefined;
}

function formatLdReg8AbsoluteLoad(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && source.kind === 'mem-abs') {
    return formatLdText(
      target.register,
      formatParenthesizedExpression(source.expression, evalContext, 'auto'),
    );
  }
  return undefined;
}

function formatLdIndirectForm(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  return (
    formatLdRegisterIndirect(target, source, evalContext) ??
    formatLdIndexed(target, source, evalContext)
  );
}

function formatLdRegisterIndirect(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  return (
    formatLdAFromRegisterIndirect(target, source) ??
    formatLdAStoreToBcDeIndirect(target, source) ??
    formatLdFromHlIndirect(target, source) ??
    formatLdToHlIndirect(target, source, evalContext)
  );
}

function formatLdAFromRegisterIndirect(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'reg-indirect') {
    return { text: `ld a, (${source.register})` };
  }
  return undefined;
}

function formatLdAStoreToBcDeIndirect(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  if (target.kind === 'reg-indirect' && isBcDeIndirectAStore(target.register, source)) {
    return { text: `ld (${target.register}), a` };
  }
  return undefined;
}

function formatLdFromHlIndirect(
  target: LdOperand,
  source: LdOperand,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && source.kind === 'reg-indirect' && source.register === 'hl') {
    return { text: `ld ${target.register}, (hl)` };
  }
  return undefined;
}

function formatLdToHlIndirect(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind === 'reg-indirect' && target.register === 'hl' && source.kind === 'reg8') {
    return { text: `ld (hl), ${source.register}` };
  }
  if (target.kind === 'reg-indirect' && target.register === 'hl' && source.kind === 'imm') {
    const value = formatExpression(source.expression, evalContext, 'byte');
    return value === undefined ? undefined : { text: `ld (hl), ${value}` };
  }
  return undefined;
}

function formatLdIndexed(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind === 'reg8' && source.kind === 'indexed') {
    const memory = formatIndexedMemory(source.register, source.displacement, evalContext);
    return memory === undefined ? undefined : { text: `ld ${target.register}, ${memory}` };
  }
  if (target.kind === 'indexed' && source.kind === 'reg8') {
    const memory = formatIndexedMemory(target.register, target.displacement, evalContext);
    return memory === undefined ? undefined : { text: `ld ${memory}, ${source.register}` };
  }
  return undefined;
}

function isBcDeIndirectAStore(register: string, source: LdOperand): boolean {
  return (register === 'bc' || register === 'de') && source.kind === 'reg8' && source.register === 'a';
}

function formatLdAbsoluteStore(
  target: LdOperand,
  source: LdOperand,
  evalContext: LoweredEvalContext,
): { readonly text: string } | undefined {
  if (target.kind !== 'mem-abs') {
    return undefined;
  }
  if (source.kind !== 'reg8' && source.kind !== 'reg16' && source.kind !== 'reg-index16') {
    return undefined;
  }
  const targetText = formatParenthesizedExpression(target.expression, evalContext, 'auto');
  return targetText === undefined ? undefined : { text: `ld ${targetText}, ${source.register}` };
}

function formatLdText(target: string, source: string | undefined): { readonly text: string } | undefined {
  return source === undefined ? undefined : { text: `ld ${target}, ${source}` };
}

function formatParenthesizedExpression(
  expression: Expression,
  evalContext: LoweredEvalContext,
  width: 'byte' | 'word' | 'auto',
): string | undefined {
  const formatted = formatExpression(expression, evalContext, width);
  return formatted === undefined ? undefined : `(${formatted})`;
}
