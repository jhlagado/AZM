import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type { Z80Instruction } from '../z80/instruction.js';
import type { Asm80Artifact, SymbolEntry } from './types.js';

const asm80Header = '; AZM lowered ASM80 output';

type ConstantMap = ReadonlyMap<string, number>;

export class UnsupportedAsm80LoweringError extends Error {
  constructor(
    message: string,
    readonly item: SourceItem,
  ) {
    super(message);
    this.name = 'UnsupportedAsm80LoweringError';
  }
}

export function writeAsm80(
  items: readonly SourceItem[],
  symbols: readonly SymbolEntry[],
): Asm80Artifact {
  const constants = collectConstants(symbols);
  const lines: string[] = [asm80Header, ''];

  for (const item of items) {
    const line = formatItem(item, constants);
    if (line === undefined) {
      throw new UnsupportedAsm80LoweringError(
        `lowered .z80 output does not yet support ${describeItem(item)}`,
        item,
      );
    }
    if (line !== '') {
      lines.push(line);
    }
  }

  return { kind: 'asm80', text: `${lines.join('\n').replace(/\n+$/, '')}\n` };
}

function collectConstants(symbols: readonly SymbolEntry[]): ConstantMap {
  const constants = new Map<string, number>();
  for (const symbol of symbols) {
    if (symbol.kind === 'constant') {
      constants.set(symbol.name, symbol.value);
    }
  }
  return constants;
}

function formatItem(item: SourceItem, constants: ConstantMap): string | undefined {
  switch (item.kind) {
    case 'org':
      return `ORG ${formatExpression(item.expression, constants, 'word')}`;
    case 'equ':
      return `${item.name} EQU ${formatExpression(item.expression, constants, 'auto')}`;
    case 'label':
      return `${item.name}:`;
    case 'instruction':
      return formatInstruction(item.instruction, constants);
    case 'enum':
    case 'type':
    case 'end':
    case 'binfrom':
    case 'binto':
      return '';
    default:
      return undefined;
  }
}

function formatInstruction(
  instruction: Z80Instruction,
  constants: ConstantMap,
): string | undefined {
  switch (instruction.mnemonic) {
    case 'ld-a-imm':
      return `ld a, ${formatExpression(instruction.expression, constants, 'byte')}`;
    case 'ld':
      if (instruction.target.kind === 'reg8' && instruction.source.kind === 'imm') {
        const source = formatExpression(
          instruction.source.expression,
          constants,
          'byte',
        );
        return source === undefined ? undefined : `ld ${instruction.target.register}, ${source}`;
      }
      return undefined;
    case 'ret':
      return 'ret';
    default:
      return undefined;
  }
}

function formatExpression(
  expression: Expression,
  constants: ConstantMap,
  width: 'byte' | 'word' | 'auto',
): string | undefined {
  const value = evaluateLoweredConstant(expression, constants);
  if (value !== undefined) {
    return formatLoweredNumber(value, width);
  }

  if (expression.kind === 'symbol') {
    return expression.name;
  }

  return undefined;
}

function evaluateLoweredConstant(
  expression: Expression,
  constants: ConstantMap,
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'symbol':
      return constants.get(expression.name);
    case 'unary': {
      const value = evaluateLoweredConstant(expression.expression, constants);
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
      break;
    }
    case 'binary': {
      const left = evaluateLoweredConstant(expression.left, constants);
      const right = evaluateLoweredConstant(expression.right, constants);
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
          return right === 0 ? undefined : Math.trunc(left / right);
        case '%':
          return right === 0 ? undefined : left % right;
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
      break;
    }
    default:
      return undefined;
  }
}

function formatLoweredNumber(value: number, width: 'byte' | 'word' | 'auto'): string {
  const normalized = value < 0 ? 0x10000 + (value & 0xffff) : value;
  const digits = normalized.toString(16).toUpperCase();
  const minWidth = width === 'word' || (width === 'auto' && normalized > 0xff) ? 4 : 2;
  return `$${digits.padStart(minWidth, '0')}`;
}

function describeItem(item: SourceItem): string {
  if (item.kind === 'instruction') {
    return `instruction "${item.instruction.mnemonic}"`;
  }
  return `directive "${item.kind}"`;
}
