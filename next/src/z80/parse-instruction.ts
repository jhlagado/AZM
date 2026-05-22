import type { Z80Instruction } from './instruction.js';
import { parseExpression } from '../syntax/parse-expression.js';

export interface ParseZ80InstructionResult {
  readonly instruction?: Z80Instruction;
  readonly error?: string;
}

export function parseZ80Instruction(text: string): ParseZ80InstructionResult | undefined {
  if (/^NOP$/i.test(text)) {
    return { instruction: { mnemonic: 'nop' } };
  }

  if (/^RET$/i.test(text)) {
    return { instruction: { mnemonic: 'ret' } };
  }

  const ldA = /^LD\s+A\s*,\s*(.+)$/i.exec(text);
  if (ldA) {
    const expressionText = ldA[1] ?? '';
    const expression = parseExpression(expressionText);
    return expression
      ? { instruction: { mnemonic: 'ld-a-imm', expression } }
      : { error: `invalid LD A immediate: ${expressionText}` };
  }

  const absoluteBranch = /^(JP|CALL)\s+(.+)$/i.exec(text);
  if (absoluteBranch) {
    const mnemonic = (absoluteBranch[1] ?? '').toLowerCase() as 'jp' | 'call';
    const expressionText = absoluteBranch[2] ?? '';
    const expression = parseExpression(expressionText);
    return expression
      ? { instruction: { mnemonic, expression } }
      : { error: `invalid ${mnemonic.toUpperCase()} target: ${expressionText}` };
  }

  const jrConditional = /^JR\s+(NZ|Z|NC|C)\s*,\s*(.+)$/i.exec(text);
  if (jrConditional) {
    const condition = (jrConditional[1] ?? '').toLowerCase() as 'nz' | 'z' | 'nc' | 'c';
    const expressionText = jrConditional[2] ?? '';
    const expression = parseExpression(expressionText);
    return expression
      ? { instruction: { mnemonic: 'jr-cc', condition, expression } }
      : { error: `invalid JR ${condition.toUpperCase()} target: ${expressionText}` };
  }

  const relativeBranch = /^(JR|DJNZ)\s+(.+)$/i.exec(text);
  if (relativeBranch) {
    const mnemonic = (relativeBranch[1] ?? '').toLowerCase() as 'jr' | 'djnz';
    const expressionText = relativeBranch[2] ?? '';
    const expression = parseExpression(expressionText);
    return expression
      ? { instruction: { mnemonic, expression } }
      : { error: `invalid ${mnemonic.toUpperCase()} target: ${expressionText}` };
  }

  return undefined;
}
