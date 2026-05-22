import type {
  Z80CoreMnemonic,
  Z80AluMnemonic,
  Z80Instruction,
  Z80IndexHalfRegister,
  Z80IndexRegister16,
  Z80JumpIndirectRegister,
  Z80Operand,
  Z80RelativeCondition,
  Z80Register16,
  Z80Register8,
  Z80RegisterIndirect,
  Z80RstVector,
  Z80StackRegister16,
} from './instruction.js';
import type { Expression } from '../model/expression.js';
import { parseExpression } from '../syntax/parse-expression.js';

export interface ParseZ80InstructionResult {
  readonly instruction?: Z80Instruction;
  readonly error?: string;
}

export function parseZ80Instruction(text: string): ParseZ80InstructionResult | undefined {
  if (/^NOP$/i.test(text)) {
    return { instruction: { mnemonic: 'nop' } };
  }

  const ret = /^RET(?:\s+(.*))?$/i.exec(text);
  if (ret) {
    const operandText = ret[1] ?? '';
    if (operandText.trim().length === 0) {
      return { instruction: { mnemonic: 'ret' } };
    }
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 1) {
      return { error: 'ret expects no operands or one condition code' };
    }
    const condition = parseCondition(parts[0] ?? '');
    return condition
      ? { instruction: { mnemonic: 'ret-cc', condition } }
      : { error: 'ret cc expects a valid condition code' };
  }

  const noOperandCore = /^(DI|EI|SCF|CCF|CPL|EXX|HALT|RETI|RETN)(?:\s+(.*))?$/i.exec(text);
  if (noOperandCore) {
    const mnemonic = (noOperandCore[1] ?? '').toLowerCase() as Z80CoreMnemonic;
    return noOperandCore[2] === undefined
      ? { instruction: { mnemonic } }
      : { error: `${mnemonic} expects no operands` };
  }

  const im = /^IM(?:\s+(.*))?$/i.exec(text);
  if (im) {
    const operandText = im[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: 'im expects one operand' };
    }
    const mode = parseConstantExpression(parts[0] ?? '');
    if (mode !== 0 && mode !== 1 && mode !== 2) {
      return { error: 'im expects 0, 1, or 2' };
    }
    return { instruction: { mnemonic: 'im', mode } };
  }

  const rst = /^RST(?:\s+(.*))?$/i.exec(text);
  if (rst) {
    const operandText = rst[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: 'rst expects one operand' };
    }
    const vector = parseConstantExpression(parts[0] ?? '');
    if (!isRstVector(vector)) {
      return { error: 'rst expects an imm8 multiple of 8 (0..56)' };
    }
    return { instruction: { mnemonic: 'rst', vector } };
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

  const incDec = /^(INC|DEC)(?:\s+(.*))?$/i.exec(text);
  if (incDec) {
    const mnemonic = (incDec[1] ?? '').toLowerCase() as 'inc' | 'dec';
    const operandText = incDec[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: `${mnemonic} expects one operand` };
    }
    const indexedBracket = indexedBracketError(parts[0] ?? '');
    if (indexedBracket) {
      return { error: indexedBracket };
    }
    const operand = parseIncDecOperand(parts[0] ?? '');
    return operand
      ? { instruction: { mnemonic, operand } }
      : { error: `${mnemonic} expects r8/rr/(hl) operand` };
  }

  const stack = /^(PUSH|POP)(?:\s+(.*))?$/i.exec(text);
  if (stack) {
    const mnemonic = (stack[1] ?? '').toLowerCase() as 'push' | 'pop';
    const operandText = stack[2] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: `${mnemonic} expects one operand` };
    }
    const register = parseStackRegister(parts[0] ?? '');
    return register
      ? { instruction: { mnemonic, register } }
      : { error: `${mnemonic} supports BC/DE/HL/AF/IX/IY only` };
  }

  const ld = /^LD\s+(.+)$/i.exec(text);
  if (ld) {
    const operandText = ld[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (parts.length !== 2) {
      return { error: 'ld expects two operands' };
    }
    const indexedBracket =
      indexedBracketError(parts[0] ?? '') ?? indexedBracketError(parts[1] ?? '');
    if (indexedBracket) {
      return { error: indexedBracket };
    }
    const target = parseLdOperand(parts[0] ?? '');
    const source = parseLdOperand(parts[1] ?? '');
    if (!target || !source) {
      return { error: `invalid LD operands: ${operandText}` };
    }
    const unsupportedReason = unsupportedLdReason(target, source);
    if (unsupportedReason) {
      return { error: unsupportedReason };
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

  const jump = /^JP(?:\s+(.*))?$/i.exec(text);
  if (jump) {
    const operandText = jump[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0) {
      return {
        error: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
      };
    }
    if (parts.length === 2) {
      const condition = parseCondition(parts[0] ?? '');
      if (!condition) {
        return { error: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M' };
      }
      const expression = parseAbsoluteBranchTarget(parts[1] ?? '');
      return expression
        ? { instruction: { mnemonic: 'jp-cc', condition, expression } }
        : { error: 'jp cc, nn expects imm16' };
    }
    if (parts.length !== 1) {
      return {
        error: 'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
      };
    }
    const single = parts[0] ?? '';
    const condition = parseCondition(single);
    if (condition) {
      return { error: 'jp cc, nn expects two operands (cc, nn)' };
    }
    const indirect = parseJumpIndirect(single);
    if (indirect) {
      return { instruction: { mnemonic: 'jp-indirect', register: indirect } };
    }
    if (/^\(.*\)$/.test(single.trim())) {
      return { error: 'jp indirect form supports (hl), (ix), or (iy) only' };
    }
    if (isRegisterName(single)) {
      if (/^(HL|IX|IY)$/i.test(single.trim())) {
        return { error: 'jp indirect form requires parentheses; use (hl), (ix), or (iy)' };
      }
      return { error: 'jp does not support register targets; use imm16' };
    }
    const expression = parseExpression(single);
    return expression
      ? { instruction: { mnemonic: 'jp', expression } }
      : { error: `invalid JP target: ${single}` };
  }

  const call = /^CALL(?:\s+(.*))?$/i.exec(text);
  if (call) {
    const operandText = call[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0) {
      return { error: 'call expects one operand (nn) or two operands (cc, nn)' };
    }
    if (parts.length === 2) {
      const condition = parseCondition(parts[0] ?? '');
      if (!condition) {
        return { error: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M' };
      }
      const expression = parseAbsoluteBranchTarget(parts[1] ?? '');
      return expression
        ? { instruction: { mnemonic: 'call-cc', condition, expression } }
        : { error: 'call cc, nn expects imm16' };
    }
    if (parts.length !== 1) {
      return { error: 'call expects one operand (nn) or two operands (cc, nn)' };
    }
    const single = parts[0] ?? '';
    const condition = parseCondition(single);
    if (condition) {
      return { error: 'call cc, nn expects two operands (cc, nn)' };
    }
    if (/^\(.*\)$/.test(single.trim())) {
      return { error: 'call does not support indirect targets; use imm16' };
    }
    if (isRegisterName(single)) {
      return { error: 'call does not support register targets; use imm16' };
    }
    const expression = parseExpression(single);
    return expression
      ? { instruction: { mnemonic: 'call', expression } }
      : { error: `invalid CALL target: ${single}` };
  }

  const jrConditional = /^JR\s+(NZ|Z|NC|C)\s*,\s*(.+)$/i.exec(text);
  if (jrConditional) {
    const condition = (jrConditional[1] ?? '').toLowerCase() as Z80RelativeCondition;
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
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
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

  const index16 = parseIndexRegister16(trimmed);
  if (index16) {
    return { kind: 'reg-index16', register: index16 };
  }

  const half = parseIndexHalfRegister(trimmed);
  if (half) {
    return { kind: 'reg-half-index', register: half };
  }

  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return parseRegister16Operand(trimmed);
  }

  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression } : undefined;
}

function parseAluOperand(text: string): Z80Operand | undefined {
  const trimmed = text.trim();
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
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

function parseIncDecOperand(
  text: string,
): Extract<Z80Instruction, { readonly mnemonic: 'inc' | 'dec' }>['operand'] | undefined {
  const trimmed = text.trim();
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
  if (/^\(HL\)$/i.test(trimmed)) {
    return { kind: 'reg-indirect', register: 'hl' };
  }
  const register8 = parseRegister8Operand(trimmed);
  if (register8) {
    return register8;
  }
  const register16 = parseRegister16Operand(trimmed);
  if (register16) {
    return register16;
  }
  const index16 = parseIndexRegister16(trimmed);
  if (index16) {
    return { kind: 'reg16', register: index16 };
  }
  const half = parseIndexHalfRegister(trimmed);
  return half ? { kind: 'reg-half-index', register: half } : undefined;
}

function parseIndexRegister16(text: string): Z80IndexRegister16 | undefined {
  const trimmed = text.trim();
  return /^(IX|IY)$/i.test(trimmed) ? (trimmed.toLowerCase() as Z80IndexRegister16) : undefined;
}

function parseIndexHalfRegister(text: string): Z80IndexHalfRegister | undefined {
  const trimmed = text.trim();
  return /^(IXH|IXL|IYH|IYL)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80IndexHalfRegister)
    : undefined;
}

function parseStackRegister(text: string): Z80StackRegister16 | undefined {
  const trimmed = text.trim();
  return /^(BC|DE|HL|AF|IX|IY)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80StackRegister16)
    : undefined;
}

function parseIndexedOperand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'indexed' }> | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }
  const inner = trimmed.slice(1, -1).trim();
  const match = /^(IX|IY)(?:\s*([+-])\s*(.+))?$/i.exec(inner);
  if (!match) {
    return undefined;
  }
  const register = (match[1] ?? '').toLowerCase() as Z80IndexRegister16;
  const sign = match[2];
  const displacementText = match[3] ?? '0';
  const parsed = parseExpression(sign === '-' ? `-${displacementText}` : displacementText);
  if (!parsed) {
    return undefined;
  }
  return { kind: 'indexed', register, displacement: parsed };
}

function indexedBracketError(text: string): string | undefined {
  const match = /^\(?\s*(IX|IY)\s*\[\s*.+?\s*\]\s*\)?$/i.exec(text.trim());
  return match
    ? `Indexed memory operands use (ix+disp)/(iy+disp), not ${match[1]?.toLowerCase()}[disp].`
    : undefined;
}

function parseAbsoluteBranchTarget(text: string): Expression | undefined {
  const trimmed = text.trim();
  if (/^\(.*\)$/.test(trimmed) || isRegisterName(trimmed)) {
    return undefined;
  }
  return parseExpression(trimmed);
}

function parseCondition(text: string): Z80InstructionCondition | undefined {
  const trimmed = text.trim();
  return /^(NZ|Z|NC|C|PO|PE|P|M)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80InstructionCondition)
    : undefined;
}

function parseJumpIndirect(text: string): Z80JumpIndirectRegister | undefined {
  const indirect = /^\((HL|IX|IY)\)$/i.exec(text.trim());
  return indirect ? ((indirect[1] ?? '').toLowerCase() as Z80JumpIndirectRegister) : undefined;
}

function isRegisterName(text: string): boolean {
  return /^(A|B|C|D|E|H|L|AF|BC|DE|HL|SP|IX|IY|IXH|IXL|IYH|IYL)$/i.test(text.trim());
}

type Z80InstructionCondition = Extract<
  Z80Instruction,
  { readonly condition: unknown }
>['condition'];

function parseConstantExpression(text: string): number | undefined {
  const expression = parseExpression(text);
  return expression ? constantExpressionValue(expression) : undefined;
}

function isRstVector(value: number | undefined): value is Z80RstVector {
  return (
    value === 0 ||
    value === 8 ||
    value === 16 ||
    value === 24 ||
    value === 32 ||
    value === 40 ||
    value === 48 ||
    value === 56
  );
}

function constantExpressionValue(expression: Expression): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'unary':
      return constantUnaryExpressionValue(expression);
    case 'binary':
      return constantBinaryExpressionValue(expression);
    case 'symbol':
    case 'current-location':
      return undefined;
  }
}

function constantUnaryExpressionValue(
  expression: Extract<Expression, { readonly kind: 'unary' }>,
): number | undefined {
  const value = constantExpressionValue(expression.expression);
  if (value === undefined) {
    return undefined;
  }
  switch (expression.operator) {
    case '+':
      return value;
    case '-':
      return -value;
    case '~':
      return ~value;
  }
}

function constantBinaryExpressionValue(
  expression: Extract<Expression, { readonly kind: 'binary' }>,
): number | undefined {
  const left = constantExpressionValue(expression.left);
  const right = constantExpressionValue(expression.right);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  switch (expression.operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return Math.trunc(left / right);
    case '%':
      return left % right;
    case '&':
      return left & right;
    case '^':
      return left ^ right;
    case '|':
      return left | right;
    case '<<':
      return left << right;
    case '>>':
      return left >> right;
  }
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
  if (isSupportedHalfIndexLd(target, source)) {
    return true;
  }

  if (target.kind === 'reg8' && (source.kind === 'reg8' || source.kind === 'imm')) {
    return true;
  }

  if (target.kind === 'reg8' && source.kind === 'indexed') {
    return true;
  }

  if (target.kind === 'indexed' && (source.kind === 'reg8' || source.kind === 'imm')) {
    return true;
  }

  if (target.kind === 'reg16' && source.kind === 'imm') {
    return true;
  }

  if (target.kind === 'reg-index16' && source.kind === 'imm') {
    return true;
  }

  if (
    target.kind === 'reg16' &&
    target.register === 'sp' &&
    (source.kind === 'reg16' || source.kind === 'reg-index16') &&
    (source.register === 'hl' || source.register === 'ix' || source.register === 'iy')
  ) {
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

function unsupportedLdReason(target: Z80Operand, source: Z80Operand): string | undefined {
  if (hasHalfIndexRegister(target, source)) {
    if (!isSameIndexHalfFamily(target, source)) {
      return 'ld between IX* and IY* byte registers is not supported';
    }
    if (usesPlainHlCounterpart(target, source)) {
      return 'ld with IX*/IY* does not support plain H/L counterpart operands';
    }
  }

  if (
    target.kind === 'reg16' &&
    source.kind !== 'imm' &&
    (source.kind === 'reg16' || source.kind === 'reg-index16')
  ) {
    if (
      target.register === 'sp' &&
      (source.register === 'hl' || source.register === 'ix' || source.register === 'iy')
    ) {
      return undefined;
    }
    return 'ld rr, rr supports SP <- HL/IX/IY only';
  }

  return undefined;
}

function isSupportedHalfIndexLd(target: Z80Operand, source: Z80Operand): boolean {
  if (!hasHalfIndexRegister(target, source)) {
    return false;
  }

  if (!isSameIndexHalfFamily(target, source) || usesPlainHlCounterpart(target, source)) {
    return false;
  }

  return isHalfIndexCompatibleByteOperand(target) && isHalfIndexCompatibleByteOperand(source);
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
  if (operand.kind !== 'reg-half-index') {
    return undefined;
  }
  return operand.register.startsWith('ix') ? 'ix' : 'iy';
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
