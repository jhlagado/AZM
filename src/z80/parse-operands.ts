import type { Expression } from '../model/expression.js';
import { applyBinaryOperator } from '../semantics/constant-operators.js';
import { parseExpression } from '../syntax/parse-expression.js';
import type {
  Z80IndexHalfRegister,
  Z80IndexRegister16,
  Z80Instruction,
  Z80Operand,
  Z80Register16,
  Z80Register8,
  Z80RegisterIndirect,
  Z80RstVector,
  Z80SpecialRegister8,
  Z80StackRegister16,
} from './instruction.js';

export function parseLdOperand(text: string): Z80Operand | undefined {
  const trimmed = text.trim();
  for (const parser of LD_OPERAND_PARSERS) {
    const operand = parser(trimmed);
    if (operand) {
      return operand;
    }
  }
  return undefined;
}

type LdOperandParser = (trimmed: string) => Z80Operand | undefined;

const LD_OPERAND_PARSERS: readonly LdOperandParser[] = [
  parseIndexedOperand,
  parseLdRegisterIndirectOperand,
  parseLdAbsoluteMemoryOperand,
  parseRegister8Operand,
  parseLdIndex16Operand,
  parseLdHalfIndexOperand,
  parseRegister16Operand,
  parseLdSpecial8Operand,
  parseLdImmediateOperand,
];

function parseLdRegisterIndirectOperand(trimmed: string): Z80Operand | undefined {
  const match = /^\((BC|DE|HL)\)$/i.exec(trimmed);
  if (!match) {
    return undefined;
  }
  return {
    kind: 'reg-indirect',
    register: (match[1] ?? '').toLowerCase() as Z80RegisterIndirect,
  };
}

function parseLdAbsoluteMemoryOperand(trimmed: string): Z80Operand | undefined {
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }
  const expression = parseExpression(trimmed.slice(1, -1).trim());
  return expression ? { kind: 'mem-abs', expression } : undefined;
}

function parseLdIndex16Operand(trimmed: string): Z80Operand | undefined {
  const register = parseIndexRegister16(trimmed);
  return register ? { kind: 'reg-index16', register } : undefined;
}

function parseLdHalfIndexOperand(trimmed: string): Z80Operand | undefined {
  const register = parseIndexHalfRegister(trimmed);
  return register ? { kind: 'reg-half-index', register } : undefined;
}

function parseLdSpecial8Operand(trimmed: string): Z80Operand | undefined {
  const register = parseSpecialRegister8(trimmed);
  return register ? { kind: 'special8', register } : undefined;
}

function parseLdImmediateOperand(trimmed: string): Z80Operand | undefined {
  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression } : undefined;
}

export function invalidLdOperandDiagnostics(text: string): readonly string[] {
  const trimmed = text.trim();
  if (trimmed === '?') {
    return ['Invalid imm expression: ?', 'Unsupported operand: ?'];
  }
  if (trimmed.startsWith("'") && parseExpression(trimmed) === undefined) {
    return [`Invalid imm expression: ${trimmed}`];
  }
  return [];
}

export function aluImm8RangeError(expression: Expression, mnemonic: string): string | undefined {
  const value = constantExpressionValue(expression);
  if (value === undefined) {
    return undefined;
  }
  if (value < -128 || value > 255) {
    return `${mnemonic} expects imm8`;
  }
  return undefined;
}

export function parseAluOperand(text: string): Z80Operand | undefined {
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

  const half = parseIndexHalfRegister(trimmed);
  if (half) {
    return { kind: 'reg-half-index', register: half };
  }

  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression } : undefined;
}

export function parseCbOperand(
  text: string,
):
  | Extract<Z80Operand, { readonly kind: 'reg8' }>
  | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
  | Extract<Z80Operand, { readonly kind: 'indexed' }>
  | undefined {
  const trimmed = text.trim();
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
  if (/^\(HL\)$/i.test(trimmed)) {
    return { kind: 'reg-indirect', register: 'hl' };
  }
  return parseRegister8Operand(trimmed);
}

export function parseRegister8Operand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'reg8' }> | undefined {
  const trimmed = text.trim();
  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase() as Z80Register8 };
  }
  return undefined;
}

export function parseRegister16Operand(
  text: string,
): Extract<Z80Operand, { readonly kind: 'reg16' }> | undefined {
  const trimmed = text.trim();
  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return { kind: 'reg16', register: trimmed.toLowerCase() as Z80Register16 };
  }
  return undefined;
}

export function parseIncDecOperand(
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

export function parseIndexRegister16(text: string): Z80IndexRegister16 | undefined {
  const trimmed = text.trim();
  return /^(IX|IY)$/i.test(trimmed) ? (trimmed.toLowerCase() as Z80IndexRegister16) : undefined;
}

export function parseIndexHalfRegister(text: string): Z80IndexHalfRegister | undefined {
  const trimmed = text.trim();
  return /^(IXH|IXL|IYH|IYL)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80IndexHalfRegister)
    : undefined;
}

export function halfIndexFamilyFromRegister(register: Z80IndexHalfRegister): Z80IndexRegister16 {
  return register.startsWith('ix') ? 'ix' : 'iy';
}

function parseSpecialRegister8(text: string): Z80SpecialRegister8 | undefined {
  const trimmed = text.trim();
  return /^(I|R)$/i.test(trimmed) ? (trimmed.toLowerCase() as Z80SpecialRegister8) : undefined;
}

export function parseStackRegister(text: string): Z80StackRegister16 | undefined {
  const trimmed = text.trim();
  return /^(BC|DE|HL|AF|IX|IY)$/i.test(trimmed)
    ? (trimmed.toLowerCase() as Z80StackRegister16)
    : undefined;
}

export function parseIndexedOperand(
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

export function parsePortOperand(
  text: string,
): { readonly kind: 'c' } | { readonly kind: 'imm'; readonly expression: Expression } | undefined {
  const trimmed = text.trim();
  if (/^\(C\)$/i.test(trimmed)) {
    return { kind: 'c' };
  }
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }
  const expression = parseExpression(trimmed.slice(1, -1).trim());
  return expression ? { kind: 'imm', expression } : undefined;
}

export function indexedBracketError(text: string): string | undefined {
  const match = /^\(?\s*((IX|IY)\s*\[\s*.+?\s*\])\s*\)?$/i.exec(text.trim());
  return match
    ? `Indexed memory operands use (ix+disp)/(iy+disp), not ${match[1]?.toLowerCase().replace(/\s+/g, '')}.`
    : undefined;
}

export function parseConstantExpression(text: string): number | undefined {
  const expression = parseExpression(text);
  return expression ? constantExpressionValue(expression) : undefined;
}

export function isRstVector(value: number | undefined): value is Z80RstVector {
  return RST_VECTORS.has(value as Z80RstVector);
}

const RST_VECTORS = new Set<Z80RstVector>([0, 8, 16, 24, 32, 40, 48, 56]);

export function parseBitIndex(text: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined {
  const value = parseConstantExpression(text);
  return isBitIndex(value) ? value : undefined;
}

function isBitIndex(value: number | undefined): value is 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return BIT_INDEXES.has(value as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7);
}

const BIT_INDEXES = new Set<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>([0, 1, 2, 3, 4, 5, 6, 7]);

export function constantExpressionValue(expression: Expression): number | undefined {
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
  return applyBinaryOperator(expression.operator, left, right);
}
