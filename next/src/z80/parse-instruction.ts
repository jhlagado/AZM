import type {
  Z80AluMnemonic,
  Z80Instruction,
  Z80Operand,
  Z80Register16,
  Z80Register8,
  Z80RegisterIndirect,
} from './instruction.js';
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

  const noOperandCore = /^(DI|EI|SCF|CCF|CPL|EXX|HALT)(?:\s+(.*))?$/i.exec(text);
  if (noOperandCore) {
    const mnemonic = (noOperandCore[1] ?? '').toLowerCase() as
      | 'di'
      | 'ei'
      | 'scf'
      | 'ccf'
      | 'cpl'
      | 'exx'
      | 'halt';
    return noOperandCore[2] === undefined
      ? { instruction: { mnemonic } }
      : { error: `${mnemonic} expects no operands` };
  }

  const exchange = /^EX\s+(.+)$/i.exec(text);
  if (exchange) {
    const operandText = exchange[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 2) {
      return { error: 'ex expects two operands' };
    }
    const left = (parts[0] ?? '').toLowerCase();
    const right = (parts[1] ?? '').toLowerCase();
    if (left === 'de' && right === 'hl') {
      return { instruction: { mnemonic: 'ex', form: 'de-hl' } };
    }
    if (left === '(sp)' && right === 'hl') {
      return { instruction: { mnemonic: 'ex', form: 'sp-hl' } };
    }
    return { error: `unsupported EX operands: ${parts.join(',')}` };
  }

  const ld = /^LD\s+(.+)$/i.exec(text);
  if (ld) {
    const operandText = ld[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 2) {
      return { error: 'ld expects two operands' };
    }
    const target = parseLdOperand(parts[0] ?? '');
    const source = parseLdOperand(parts[1] ?? '');
    if (!target || !source) {
      return { error: `invalid LD operands: ${operandText}` };
    }
    if (!isSupportedLd(target, source)) {
      return { error: `unsupported LD operands: ${operandText}` };
    }
    return { instruction: { mnemonic: 'ld', target, source } };
  }

  const accumulatorAlu = /^(ADD|ADC|SBC)\s+(.+)$/i.exec(text);
  if (accumulatorAlu) {
    const mnemonic = (accumulatorAlu[1] ?? '').toLowerCase() as Z80AluMnemonic;
    const operandText = accumulatorAlu[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 2) {
      return { error: `${mnemonic} expects destination A and one source operand` };
    }
    const target = parseRegister8Operand(parts[0] ?? '');
    if (target?.register === 'a') {
      const source = parseAluOperand(parts[1] ?? '');
      return source
        ? { instruction: { mnemonic, source } }
        : { error: `invalid ${mnemonic.toUpperCase()} operand: ${parts[1] ?? ''}` };
    }

    const target16 = parseRegister16Operand(parts[0] ?? '');
    if (target16?.register === 'hl') {
      const source = parseRegister16Operand(parts[1] ?? '');
      return source
        ? { instruction: { mnemonic: mnemonic as 'add' | 'adc' | 'sbc', target: target16, source } }
        : { error: `${mnemonic} HL arithmetic source must be BC, DE, HL, or SP` };
    }

    return { error: `${mnemonic} two-operand form requires destination A or HL` };
  }

  const alu = /^(SUB|AND|OR|XOR|CP)\s+(.+)$/i.exec(text);
  if (alu) {
    const mnemonic = (alu[1] ?? '').toLowerCase() as Z80AluMnemonic;
    const operandText = alu[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length === 2) {
      const target = parseRegister8Operand(parts[0] ?? '');
      if (target?.register === 'a') {
        const source = parseAluOperand(parts[1] ?? '');
        return source
          ? { instruction: { mnemonic, source } }
          : { error: `invalid ${mnemonic.toUpperCase()} operand: ${parts[1] ?? ''}` };
      }
      return { error: `${mnemonic} two-operand form requires destination A` };
    }
    if (parts.length !== 1) {
      return { error: `${mnemonic} expects one operand` };
    }
    const source = parseAluOperand(parts[0] ?? '');
    return source
      ? { instruction: { mnemonic, source } }
      : { error: `invalid ${mnemonic.toUpperCase()} operand: ${operandText}` };
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

function parseLdOperand(text: string): Z80Operand | undefined {
  const trimmed = text.trim();
  const memory = /^\((BC|DE|HL)\)$/i.exec(trimmed);
  if (memory) {
    return {
      kind: 'reg-indirect',
      register: (memory[1] ?? '').toLowerCase() as Z80RegisterIndirect,
    };
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return undefined;
  }

  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase() as Z80Register8 };
  }

  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return parseRegister16Operand(trimmed);
  }

  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression } : undefined;
}

function parseAluOperand(text: string): Z80Operand | undefined {
  const trimmed = text.trim();
  const memory = /^\(HL\)$/i.exec(trimmed);
  if (memory) {
    return { kind: 'reg-indirect', register: 'hl' };
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return undefined;
  }

  const register = parseRegister8Operand(trimmed);
  if (register) {
    return register;
  }

  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression } : undefined;
}

function parseRegister8Operand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'reg8' }> | undefined {
  const trimmed = text.trim();
  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase() as Z80Register8 };
  }
  return undefined;
}

function parseRegister16Operand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'reg16' }> | undefined {
  const trimmed = text.trim();
  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return { kind: 'reg16', register: trimmed.toLowerCase() as Z80Register16 };
  }
  return undefined;
}

function splitInstructionOperands(text: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (quote) {
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      values.push(text.slice(start, index));
      start = index + 1;
    }
  }
  values.push(text.slice(start));
  return values.map((value) => value.trim());
}

function isSupportedLd(target: Z80Operand, source: Z80Operand): boolean {
  if (target.kind === 'reg8' && (source.kind === 'reg8' || source.kind === 'imm')) {
    return true;
  }

  if (target.kind === 'reg16' && source.kind === 'imm') {
    return true;
  }

  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'reg-indirect') {
    return true;
  }

  if (target.kind === 'reg-indirect' && source.kind === 'reg8' && source.register === 'a') {
    return true;
  }

  if (target.kind === 'reg-indirect' && target.register === 'hl' && source.kind === 'reg8') {
    return true;
  }

  return target.kind === 'reg8' && source.kind === 'reg-indirect' && source.register === 'hl';
}
