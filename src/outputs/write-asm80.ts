import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import { instructionSize } from '../assembly/fixup-emission.js';
import type { Z80AluMnemonic, Z80Instruction, Z80Operand } from '../z80/instruction.js';
import type { Asm80Artifact, SymbolEntry, WriteAsm80Options } from './types.js';

const asm80Header = '; AZM lowered ASM80 output';

type ConstantMap = ReadonlyMap<string, number>;
type Asm80Line = { readonly text: string; readonly size: number };
type LdOperand = Extract<Z80Instruction, { readonly mnemonic: 'ld' }>['target'];

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
    case 'db':
      return formatDb(item.values, constants, state);
    case 'dw':
      return formatDw(item.values, constants, state);
    case 'ds':
      return formatDs(item.size, item.fill, constants, state);
    case 'align':
      return formatAlign(item.alignment, constants, state);
    case 'string-data':
      return formatStringData(item.directive, item.value, state);
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

function formatDb(
  values: Extract<SourceItem, { readonly kind: 'db' }>['values'],
  constants: ConstantMap,
  state: FormatState,
): Asm80Line | undefined {
  const parts: string[] = [];
  let size = 0;
  for (const value of values) {
    if (value.kind === 'string-fragment') {
      for (const char of value.value) {
        parts.push(formatLoweredNumber(char.codePointAt(0) ?? 0, 'byte'));
        size += 1;
      }
      continue;
    }
    const expression = formatExpression(value, constants, 'byte');
    if (expression === undefined) {
      return undefined;
    }
    parts.push(expression);
    size += 1;
  }
  if (parts.length === 0) {
    return { text: '', size: 0 };
  }
  return withImplicitOrg(state, `DB ${parts.join(', ')}`, size);
}

function formatDs(
  sizeExpression: Expression,
  fillExpression: Expression | undefined,
  constants: ConstantMap,
  state: FormatState,
): Asm80Line | undefined {
  const sizeValue = evaluateLoweredConstant(sizeExpression, constants);
  const size = formatExpression(sizeExpression, constants, 'auto');
  if (sizeValue === undefined || size === undefined) {
    return undefined;
  }
  if (fillExpression === undefined) {
    return withImplicitOrg(state, `DS ${size}`, sizeValue);
  }
  const fill = formatExpression(fillExpression, constants, 'byte');
  return fill === undefined ? undefined : withImplicitOrg(state, `DS ${size}, ${fill}`, sizeValue);
}

function formatDw(
  values: Extract<SourceItem, { readonly kind: 'dw' }>['values'],
  constants: ConstantMap,
  state: FormatState,
): Asm80Line | undefined {
  const parts: string[] = [];
  for (const value of values) {
    const expression = formatExpression(value, constants, 'auto');
    if (expression === undefined) {
      return undefined;
    }
    parts.push(expression);
  }
  return withImplicitOrg(state, `DW ${parts.join(', ')}`, values.length * 2);
}

function formatAlign(
  alignmentExpression: Expression,
  constants: ConstantMap,
  state: FormatState,
): Asm80Line | undefined {
  const alignment = evaluateLoweredConstant(alignmentExpression, constants);
  if (alignment === undefined || alignment <= 0) {
    return undefined;
  }
  const padding = (alignment - (state.address % alignment)) % alignment;
  return padding === 0
    ? { text: '', size: 0 }
    : withImplicitOrg(state, `DS ${formatLoweredNumber(padding, 'byte')}, $00`, padding);
}

function formatStringData(
  directive: Extract<SourceItem, { readonly kind: 'string-data' }>['directive'],
  value: string,
  state: FormatState,
): Asm80Line | undefined {
  const bytes = stringDirectiveBytes(directive, value);
  if (bytes.length === 0) {
    return { text: '', size: 0 };
  }
  return withImplicitOrg(
    state,
    `DB ${bytes.map((byte) => formatLoweredNumber(byte, 'byte')).join(', ')}`,
    bytes.length,
  );
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
      return formatLd(instruction.target, instruction.source, constants);
    case 'nop':
      return { text: 'nop' };
    case 'ret':
      return { text: 'ret' };
    case 'di':
    case 'ei':
    case 'scf':
    case 'ccf':
    case 'cpl':
    case 'daa':
    case 'exx':
    case 'halt':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldir':
    case 'ldd':
    case 'lddr':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'ini':
    case 'inir':
    case 'ind':
    case 'indr':
    case 'outi':
    case 'otir':
    case 'outd':
    case 'otdr':
    case 'reti':
    case 'retn':
      return { text: instruction.mnemonic };
    case 'im':
      return { text: `im ${formatLoweredNumber(instruction.mode, 'byte')}` };
    case 'rst':
      return { text: `rst ${formatLoweredNumber(instruction.vector, 'byte')}` };
    case 'add':
      if ('target' in instruction) {
        return formatReg16Alu('add', instruction.target, instruction.source);
      }
      return formatAlu('add', instruction.source, constants);
    case 'adc':
    case 'sbc':
      if ('target' in instruction) {
        return formatReg16Alu(instruction.mnemonic, instruction.target, instruction.source);
      }
      return formatAlu(instruction.mnemonic, instruction.source, constants);
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return formatAlu(instruction.mnemonic, instruction.source, constants);
    case 'ex':
      return formatEx(instruction.form);
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

function formatAlu(
  mnemonic: Z80AluMnemonic,
  source: Z80Operand,
  constants: ConstantMap,
): { readonly text: string } | undefined {
  const operand = formatAluOperand(source, constants);
  if (operand === undefined) {
    return undefined;
  }
  if (mnemonic === 'add' || mnemonic === 'adc' || mnemonic === 'sbc') {
    return { text: `${mnemonic} a, ${operand}` };
  }
  if (mnemonic === 'xor' && source.kind === 'reg8' && source.register === 'a') {
    return { text: 'xor a' };
  }
  return { text: `${mnemonic} ${operand}` };
}

function formatAluOperand(source: Z80Operand, constants: ConstantMap): string | undefined {
  if (source.kind === 'reg8') {
    return source.register;
  }
  if (source.kind === 'reg-indirect' && source.register === 'hl') {
    return '(HL)';
  }
  if (source.kind === 'imm') {
    return formatExpression(source.expression, constants, 'byte');
  }
  return undefined;
}

function formatReg16Alu(
  mnemonic: 'add' | 'adc' | 'sbc',
  target: Extract<Z80Instruction, { readonly mnemonic: 'add' }>['target'],
  source: Extract<Z80Instruction, { readonly mnemonic: 'add' }>['source'],
): { readonly text: string } | undefined {
  const targetText = formatReg16PairOperand(target);
  const sourceText = formatReg16PairOperand(source);
  return targetText === undefined || sourceText === undefined
    ? undefined
    : { text: `${mnemonic} ${targetText}, ${sourceText}` };
}

function formatReg16PairOperand(
  operand: Extract<Z80Instruction, { readonly mnemonic: 'add' }>['target'],
): string | undefined {
  if (operand.kind === 'reg16') {
    return operand.register;
  }
  if (operand.kind === 'reg-index16') {
    return operand.register;
  }
  return undefined;
}

function formatEx(
  form: Extract<Z80Instruction, { readonly mnemonic: 'ex' }>['form'],
): { readonly text: string } | undefined {
  switch (form) {
    case 'af-af':
      return { text: "ex af, af'" };
    case 'de-hl':
      return { text: 'ex de, hl' };
    case 'sp-hl':
      return { text: 'ex (sp), hl' };
    case 'sp-ix':
      return { text: 'ex (SP), ix' };
    case 'sp-iy':
      return { text: 'ex (SP), iy' };
  }
}

function formatLd(target: LdOperand, source: LdOperand, constants: ConstantMap) {
  if (target.kind === 'reg8' && source.kind === 'imm') {
    return formatLdText(target.register, formatExpression(source.expression, constants, 'byte'));
  }

  if (target.kind === 'reg8' && source.kind === 'reg8') {
    return { text: `ld ${target.register}, ${source.register}` };
  }

  if (target.kind === 'reg16' && source.kind === 'imm') {
    return formatLdText(target.register, formatExpression(source.expression, constants, 'word'));
  }

  if (target.kind === 'reg16' && source.kind === 'mem-abs') {
    return formatLdText(target.register, formatParenthesizedExpression(source.expression, constants, 'auto'));
  }

  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'reg-indirect') {
    return { text: `ld a, (${source.register})` };
  }

  if (
    target.kind === 'reg-indirect' &&
    (target.register === 'bc' || target.register === 'de') &&
    source.kind === 'reg8' &&
    source.register === 'a'
  ) {
    return { text: `ld (${target.register}), a` };
  }

  if (target.kind === 'reg8' && target.register === 'a' && source.kind === 'mem-abs') {
    return formatLdText('a', formatParenthesizedExpression(source.expression, constants, 'auto'));
  }

  if (target.kind === 'mem-abs' && source.kind === 'reg8' && source.register === 'a') {
    const targetText = formatParenthesizedExpression(target.expression, constants, 'auto');
    return targetText === undefined ? undefined : { text: `ld ${targetText}, a` };
  }

  return undefined;
}

function formatLdText(target: string, source: string | undefined) {
  return source === undefined ? undefined : { text: `ld ${target}, ${source}` };
}

function formatParenthesizedExpression(
  expression: Expression,
  constants: ConstantMap,
  width: 'byte' | 'word' | 'auto',
): string | undefined {
  const formatted = formatExpression(expression, constants, width);
  return formatted === undefined ? undefined : `(${formatted})`;
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

function stringDirectiveBytes(
  directive: Extract<SourceItem, { readonly kind: 'string-data' }>['directive'],
  value: string,
): number[] {
  const bytes = [...value].map((char) => char.codePointAt(0) ?? 0);
  switch (directive) {
    case 'cstr':
      return [...bytes, 0];
    case 'pstr':
      return [bytes.length & 0xff, ...bytes];
    case 'istr':
      if (bytes.length === 0) {
        return [];
      }
      return bytes.map((byte, index) => (index === bytes.length - 1 ? byte | 0x80 : byte));
  }
}

function describeItem(item: SourceItem): string {
  if (item.kind === 'instruction') {
    return `instruction "${item.instruction.mnemonic}"`;
  }
  return `directive "${item.kind}"`;
}
