import type { Expression } from '../model/expression.js';
import { parseExpression } from '../syntax/parse-expression.js';
import type { Z80JumpIndirectRegister } from './instruction.js';
import { splitInstructionOperands } from './operand-split.js';
import { parseCondition, parseRelativeCondition } from './parse-conditions.js';
import type { ParseZ80InstructionResult } from './parse-instruction.js';

export function parseJumpInstruction(text: string): ParseZ80InstructionResult | undefined {
  const jump = /^JP(?:\s+(.*))?$/i.exec(text);
  if (jump) {
    const operandText = jump[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0) {
      return {
        error: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
      };
    }
    if (parts.length === 2) return parseConditionalJump(parts[0] ?? '', parts[1] ?? '');
    if (parts.length !== 1) {
      return {
        error: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
      };
    }
    return parseSingleJump(parts[0] ?? '');
  }
  return undefined;
}

function parseConditionalJump(
  conditionText: string,
  targetText: string,
): ParseZ80InstructionResult {
  const condition = parseCondition(conditionText);
  if (!condition) {
    return { error: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M' };
  }
  if (/^\(.*\)$/.test(targetText.trim())) {
    return { error: 'jp cc, nn does not support indirect targets' };
  }
  const expression = parseAbsoluteBranchTarget(targetText);
  return expression
    ? { instruction: { mnemonic: 'jp-cc', condition, expression } }
    : { error: 'jp cc, nn expects imm16' };
}

function parseSingleJump(targetText: string): ParseZ80InstructionResult {
  const condition = parseCondition(targetText);
  if (condition) {
    return { error: 'jp cc, nn expects two operands (cc, nn)' };
  }
  const indirect = parseJumpIndirect(targetText);
  if (indirect) {
    return { instruction: { mnemonic: 'jp-indirect', register: indirect } };
  }
  const targetError = singleJumpTargetError(targetText);
  if (targetError) {
    return { error: targetError };
  }
  const expression = parseExpression(targetText);
  return expression
    ? { instruction: { mnemonic: 'jp', expression } }
    : { error: `invalid JP target: ${targetText}` };
}

function singleJumpTargetError(targetText: string): string | undefined {
  const trimmed = targetText.trim();
  if (/^\(.*\)$/.test(trimmed)) {
    return 'jp indirect form supports (hl), (ix), or (iy) only';
  }
  if (/^(HL|IX|IY)$/i.test(trimmed)) {
    return 'jp indirect form requires parentheses; use (hl), (ix), or (iy)';
  }
  return isRegisterName(targetText) ? 'jp does not support register targets; use imm16' : undefined;
}

export function parseCallInstruction(text: string): ParseZ80InstructionResult | undefined {
  const call = /^CALL(?:\s+(.*))?$/i.exec(text);
  if (call) {
    const operandText = call[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0) {
      return { error: 'call expects one operand (nn) or two operands (cc, nn)' };
    }
    if (parts.length === 2) return parseConditionalCall(parts[0] ?? '', parts[1] ?? '');
    if (parts.length !== 1) {
      return { error: 'call expects one operand (nn) or two operands (cc, nn)' };
    }
    return parseSingleCall(parts[0] ?? '');
  }
  return undefined;
}

function parseConditionalCall(
  conditionText: string,
  targetText: string,
): ParseZ80InstructionResult {
  const condition = parseCondition(conditionText);
  if (!condition) {
    return { error: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M' };
  }
  if (/^\(.*\)$/.test(targetText.trim())) {
    return { error: 'call cc, nn does not support indirect targets' };
  }
  const expression = parseAbsoluteBranchTarget(targetText);
  return expression
    ? { instruction: { mnemonic: 'call-cc', condition, expression } }
    : { error: 'call cc, nn expects imm16' };
}

function parseSingleCall(targetText: string): ParseZ80InstructionResult {
  const condition = parseCondition(targetText);
  if (condition) {
    return { error: 'call cc, nn expects two operands (cc, nn)' };
  }
  if (/^\(.*\)$/.test(targetText.trim())) {
    return { error: 'call does not support indirect targets; use imm16' };
  }
  if (isRegisterName(targetText)) {
    return { error: 'call does not support register targets; use imm16' };
  }
  const expression = parseExpression(targetText);
  return expression
    ? { instruction: { mnemonic: 'call', expression } }
    : { error: `invalid CALL target: ${targetText}` };
}

export function parseRelativeBranchInstruction(
  text: string,
): ParseZ80InstructionResult | undefined {
  const relativeBranch = /^(JR|DJNZ)(?:\s+(.*))?$/i.exec(text);
  if (relativeBranch) {
    const mnemonic = (relativeBranch[1] ?? '').toLowerCase() as 'jr' | 'djnz';
    return parseRelativeBranchOperands(mnemonic, relativeBranch[2] ?? '');
  }
  return undefined;
}

function parseRelativeBranchOperands(
  mnemonic: 'jr' | 'djnz',
  operandText: string,
): ParseZ80InstructionResult {
  const trimmed = operandText.trim();
  if (trimmed.length === 0) return { error: relativeBranchArityError(mnemonic) };
  const parts = splitInstructionOperands(trimmed);
  return mnemonic === 'djnz' ? parseDjnzBranch(parts) : parseJrBranch(parts);
}

function parseJrBranch(parts: readonly string[]): ParseZ80InstructionResult {
  if (parts.length === 1) {
    return parseUnconditionalRelativeJump(parts[0] ?? '');
  }
  if (parts.length === 2) {
    return parseConditionalRelativeJump(parts[0] ?? '', parts[1] ?? '');
  }
  return { error: 'jr expects one operand (disp8) or two operands (cc, disp8)' };
}

function relativeBranchArityError(mnemonic: 'jr' | 'djnz'): string {
  return mnemonic === 'djnz'
    ? 'djnz expects one operand (disp8)'
    : 'jr expects one operand (disp8) or two operands (cc, disp8)';
}

function parseDjnzBranch(parts: readonly string[]): ParseZ80InstructionResult {
  if (parts.length !== 1) {
    return { error: 'djnz expects one operand (disp8)' };
  }
  const targetText = parts[0] ?? '';
  const targetError = relativeDispTargetError(targetText, {
    indirect: 'djnz does not support indirect targets; expects disp8',
    register: 'djnz does not support register targets; expects disp8',
  });
  if (targetError) {
    return { error: targetError };
  }
  const expression = parseExpression(targetText);
  return expression
    ? { instruction: { mnemonic: 'djnz', expression } }
    : { error: 'djnz expects disp8' };
}

function parseUnconditionalRelativeJump(targetText: string): ParseZ80InstructionResult {
  const targetError = relativeDispTargetError(targetText, {
    indirect: 'jr does not support indirect targets; expects disp8',
    register: 'jr does not support register targets; expects disp8',
  });
  if (targetError) {
    return { error: targetError };
  }
  if (parseRelativeCondition(targetText)) {
    return { error: 'jr cc, disp expects two operands (cc, disp8)' };
  }
  const expression = parseExpression(targetText);
  return expression
    ? { instruction: { mnemonic: 'jr', expression } }
    : { error: 'jr expects disp8' };
}

function parseConditionalRelativeJump(
  conditionText: string,
  targetText: string,
): ParseZ80InstructionResult {
  const condition = parseRelativeCondition(conditionText);
  if (!condition) {
    return { error: 'jr cc expects valid condition code NZ/Z/NC/C' };
  }
  const targetError = relativeDispTargetError(targetText, {
    indirect: 'jr cc, disp does not support indirect targets',
    register: 'jr cc, disp does not support register targets; expects disp8',
  });
  if (targetError) {
    return { error: targetError };
  }
  const expression = parseExpression(targetText);
  return expression
    ? { instruction: { mnemonic: 'jr-cc', condition, expression } }
    : { error: 'jr cc, disp expects disp8' };
}

function parseAbsoluteBranchTarget(text: string): Expression | undefined {
  const trimmed = text.trim();
  if (/^\(.*\)$/.test(trimmed) || isRegisterName(trimmed)) {
    return undefined;
  }
  return parseExpression(trimmed);
}

function parseJumpIndirect(text: string): Z80JumpIndirectRegister | undefined {
  const indirect = /^\((HL|IX|IY)\)$/i.exec(text.trim());
  return indirect ? ((indirect[1] ?? '').toLowerCase() as Z80JumpIndirectRegister) : undefined;
}

function isRegisterName(text: string): boolean {
  return /^(A|B|C|D|E|H|L|I|R|AF|BC|DE|HL|SP|IX|IY|IXH|IXL|IYH|IYL)$/i.test(text.trim());
}

function relativeDispTargetError(
  text: string,
  messages: { readonly indirect: string; readonly register: string },
): string | undefined {
  const trimmed = text.trim();
  if (/^\(.*\)$/.test(trimmed)) {
    return messages.indirect;
  }
  if (isRegisterName(trimmed)) {
    return messages.register;
  }
  const expression = parseExpression(trimmed);
  if (expression?.kind === 'symbol' && isRegisterName(expression.name)) {
    return messages.register;
  }
  return undefined;
}
