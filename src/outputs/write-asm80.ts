import type { LayoutRecord } from '../semantics/expression-evaluation.js';
import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import { instructionSize } from '../assembly/fixup-emission.js';
import type { Asm80Artifact, SymbolEntry, WriteAsm80Options } from './types.js';
import {
  evaluateLoweredConstant,
  formatExpression,
  formatLoweredNumber,
  type ConstantMap,
  type LayoutMap,
  type LoweredEvalContext,
} from './asm80-expressions.js';
import { formatInstruction } from './asm80-instructions.js';
import { stringDirectiveBytes } from './asm80-strings.js';

const asm80Header = '; AZM lowered ASM80 output';

type Asm80Line = { readonly text: string; readonly size: number };
interface FormatState {
  address: number;
  emittedOrg: boolean;
  needsImplicitOrg: boolean;
}
type ItemFormatter<T extends SourceItem = SourceItem> = (
  item: T,
  evalContext: LoweredEvalContext,
  state: FormatState,
) => Asm80Line | undefined;

const FORMATTERS = {
  org: formatOrg,
  equ: formatEqu,
  comment: formatComment,
  label: formatLabel,
  db: formatDbItem,
  dw: formatDwItem,
  ds: formatDsItem,
  align: formatAlignItem,
  'string-data': formatStringDataItem,
  instruction: formatInstructionItem,
  enum: formatIgnoredItem,
  type: formatIgnoredItem,
  'type-alias': formatIgnoredItem,
  end: formatIgnoredItem,
  binfrom: formatIgnoredItem,
  binto: formatIgnoredItem,
} satisfies {
  readonly [K in SourceItem['kind']]: ItemFormatter<Extract<SourceItem, { readonly kind: K }>>;
};

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
  const importedItem = items.find((item) => item.span.sourceRelation === 'import');
  if (importedItem !== undefined) {
    throw new UnsupportedAsm80LoweringError(
      'lowered .z80 output does not yet support .import source units',
      importedItem,
    );
  }

  const evalContext: LoweredEvalContext = {
    constants: collectConstants(symbols),
    symbols: collectSymbolValues(symbols),
    layouts: collectLayouts(items),
  };
  const lines: string[] = [asm80Header, ''];
  const state: FormatState = {
    address: 0,
    emittedOrg: false,
    needsImplicitOrg: !items.some((item) => item.kind === 'org'),
  };

  for (const item of items) {
    const line = formatItem(item, evalContext, state);
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

function collectSymbolValues(symbols: readonly SymbolEntry[]): ConstantMap {
  const values = new Map<string, number>();
  for (const symbol of symbols) {
    values.set(symbol.name, symbol.kind === 'constant' ? symbol.value : symbol.address);
  }
  return values;
}

function collectLayouts(items: readonly SourceItem[]): LayoutMap {
  const layouts = new Map<string, LayoutRecord>();
  for (const item of items) {
    if (item.kind === 'type') {
      layouts.set(item.name, {
        kind: item.layoutKind,
        fields: item.fields,
        span: item.span,
      });
    } else if (item.kind === 'type-alias') {
      layouts.set(item.name, {
        kind: 'alias',
        typeExpr: item.typeExpr,
        span: item.span,
      });
    }
  }
  return layouts;
}

function formatItem(
  item: SourceItem,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  const formatter = FORMATTERS[item.kind] as ItemFormatter<typeof item>;
  return formatter(item, evalContext, state);
}

function formatOrg(
  item: Extract<SourceItem, { readonly kind: 'org' }>,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  const expression = formatExpression(item.expression, evalContext, 'word');
  const address = evaluateLoweredConstant(item.expression, evalContext);
  if (expression === undefined || address === undefined) {
    return undefined;
  }
  state.address = address;
  state.emittedOrg = true;
  return { text: `ORG ${expression}`, size: 0 };
}

function formatEqu(
  item: Extract<SourceItem, { readonly kind: 'equ' }>,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  const expression = formatExpression(item.expression, evalContext, 'auto');
  return expression === undefined
    ? undefined
    : withImplicitOrg(state, `${item.name} EQU ${expression}`, 0);
}

function formatComment(item: Extract<SourceItem, { readonly kind: 'comment' }>): Asm80Line {
  return {
    text: item.origin === 'user' ? `; ${item.text}` : `; AZM: ${item.text}`,
    size: 0,
  };
}

function formatLabel(
  item: Extract<SourceItem, { readonly kind: 'label' }>,
  _evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  return withImplicitOrg(state, `${item.name}:`, 0);
}

function formatDbItem(
  item: Extract<SourceItem, { readonly kind: 'db' }>,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  return formatDb(item.values, evalContext, state);
}

function formatDwItem(
  item: Extract<SourceItem, { readonly kind: 'dw' }>,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  return formatDw(item.values, evalContext, state);
}

function formatDsItem(
  item: Extract<SourceItem, { readonly kind: 'ds' }>,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  return formatDs(item.size, item.fill, evalContext, state);
}

function formatAlignItem(
  item: Extract<SourceItem, { readonly kind: 'align' }>,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  return formatAlign(item.alignment, evalContext, state);
}

function formatStringDataItem(
  item: Extract<SourceItem, { readonly kind: 'string-data' }>,
  _evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  return formatStringData(item.directive, item.value, state);
}

function formatInstructionItem(
  item: Extract<SourceItem, { readonly kind: 'instruction' }>,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  return withImplicitOrg(
    state,
    formatInstruction(item.instruction, evalContext)?.text,
    instructionSize(item.instruction),
  );
}

function formatIgnoredItem(): Asm80Line {
  return { text: '', size: 0 };
}

function formatDb(
  values: Extract<SourceItem, { readonly kind: 'db' }>['values'],
  evalContext: LoweredEvalContext,
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
    const expression = formatExpression(value, evalContext, 'byte');
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
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  const sizeValue = evaluateLoweredConstant(sizeExpression, evalContext);
  const size = formatExpression(sizeExpression, evalContext, 'auto');
  if (sizeValue === undefined || size === undefined) {
    return undefined;
  }
  if (fillExpression === undefined) {
    return withImplicitOrg(state, `DS ${size}`, sizeValue);
  }
  const fill = formatExpression(fillExpression, evalContext, 'byte');
  return fill === undefined ? undefined : withImplicitOrg(state, `DS ${size}, ${fill}`, sizeValue);
}

function formatDw(
  values: Extract<SourceItem, { readonly kind: 'dw' }>['values'],
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  const parts: string[] = [];
  for (const value of values) {
    const expression = formatExpression(value, evalContext, 'auto');
    if (expression === undefined) {
      return undefined;
    }
    parts.push(expression);
  }
  return withImplicitOrg(state, `DW ${parts.join(', ')}`, values.length * 2);
}

function formatAlign(
  alignmentExpression: Expression,
  evalContext: LoweredEvalContext,
  state: FormatState,
): Asm80Line | undefined {
  const alignment = evaluateLoweredConstant(alignmentExpression, evalContext);
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

function describeItem(item: SourceItem): string {
  if (item.kind === 'instruction') {
    return `instruction "${item.instruction.mnemonic}"`;
  }
  return `directive "${item.kind}"`;
}
