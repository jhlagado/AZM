import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import { instructionSize } from '../assembly/fixup-emission.js';
import type { Z80Instruction } from '../z80/instruction.js';
import type { Asm80Artifact, SymbolEntry, WriteAsm80Options } from './types.js';

const asm80Header = '; AZM lowered ASM80 output';

type ConstantMap = ReadonlyMap<string, number>;
type Asm80Line = { readonly text: string; readonly size: number };

interface FormatState {
  address: number;
  emittedOrg: boolean;
  needsImplicitOrg: boolean;
}

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
  opts: WriteAsm80Options = {},
): Asm80Artifact {
  void opts;
  const constants = collectConstants(symbols);
  const lines: string[] = [asm80Header, ''];
  const state: FormatState = {
    address: 0,
    emittedOrg: false,
    needsImplicitOrg: !items.some((item) => item.kind === 'org'),
  };

  for (const item of items) {
    const line = formatItem(item, constants, state);
    if (line === undefined) {
      throw new UnsupportedAsm80LoweringError(
        `lowered .z80 output does not yet support ${describeItem(item)}`,
        item,
      );
    }
    state.address += line.size;
    if (line.text !== '') {
      lines.push(line.text);
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

function formatItem(
  item: SourceItem,
  constants: ConstantMap,
  state: FormatState,
): Asm80Line | undefined {
  switch (item.kind) {
    case 'org': {
      const expression = formatExpression(item.expression, constants, 'word');
      const address = evaluateLoweredConstant(item.expression, constants);
      if (expression === undefined || address === undefined) {
        return undefined;
      }
      state.address = address;
      state.emittedOrg = true;
      return { text: `ORG ${expression}`, size: 0 };
    }
    case 'equ': {
      const expression = formatExpression(item.expression, constants, 'auto');
      return expression === undefined
        ? undefined
        : withImplicitOrg(state, `${item.name} EQU ${expression}`, 0);
    }
    case 'label':
      return withImplicitOrg(state, `${item.name}:`, 0);
    case 'instruction':
      return withImplicitOrg(
        state,
        formatInstruction(item.instruction, constants)?.text,
        instructionSize(item.instruction),
      );
    case 'enum':
    case 'type':
    case 'end':
    case 'binfrom':
    case 'binto':
      return { text: '', size: 0 };
    default:
      return undefined;
  }
}

function formatInstruction(
  instruction: Z80Instruction,
  constants: ConstantMap,
): { readonly text: string } | undefined {
  const size = instructionSize(instruction);
  void size;
  switch (instruction.mnemonic) {
    case 'ld-a-imm': {
      const expression = formatExpression(instruction.expression, constants, 'byte');
      if (expression === undefined) {
        return undefined;
      }
      return {
        text: `ld a, ${expression}`,
      };
    }
    case 'ld':
      if (instruction.target.kind === 'reg8' && instruction.source.kind === 'imm') {
        const source = formatExpression(
          instruction.source.expression,
          constants,
          'byte',
        );
        return source === undefined
          ? undefined
          : { text: `ld ${instruction.target.register}, ${source}` };
      }
      return undefined;
    case 'nop':
      return { text: 'nop' };
    case 'ret':
      return { text: 'ret' };
    case 'jp':
      return formatBranch('jp', instruction.expression, constants);
    case 'jp-cc':
      return formatBranch(`jp ${instruction.condition},`, instruction.expression, constants);
    case 'jp-indirect':
      return { text: `jp (${instruction.register})` };
    case 'jr':
      return formatBranch('jr', instruction.expression, constants);
    case 'jr-cc':
      return formatBranch(`jr ${instruction.condition},`, instruction.expression, constants);
    case 'call':
      return formatBranch('call', instruction.expression, constants);
    case 'call-cc':
      return formatBranch(`call ${instruction.condition},`, instruction.expression, constants);
    case 'djnz':
      return formatBranch('djnz', instruction.expression, constants);
    default:
      return undefined;
  }
}

function withImplicitOrg(
  state: FormatState,
  text: string | undefined,
  size: number,
): Asm80Line | undefined {
  if (text === undefined) {
    return undefined;
  }
  if (state.emittedOrg || !state.needsImplicitOrg) {
    return { text, size };
  }
  state.emittedOrg = true;
  return { text: `ORG $00\n${text}`, size };
}

function formatBranch(
  mnemonic: string,
  expression: Expression,
  constants: ConstantMap,
): { readonly text: string } | undefined {
  const target = formatExpression(expression, constants, 'word');
  return target === undefined ? undefined : { text: `${mnemonic} ${target}` };
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
