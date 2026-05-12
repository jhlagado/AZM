import type { EmittedByteMap } from '../../src/formats/types.js';
import type {
  LoweredAsmBlock,
  LoweredAsmItem,
  LoweredAsmProgram,
  LoweredImmExpr,
} from '../../src/lowering/loweredAsmTypes.js';
import {
  getMap,
  getProgram,
  type CompiledLoweredProgram,
  type LoweredBlockMatcher,
  type LoweredInstrView,
  type LoweredLabelView,
} from './lowered_program_types.js';

function readResolvedBytes(map: EmittedByteMap | undefined, address: number, size: number): number[] | undefined {
  if (!map || size <= 0) return undefined;
  const bytes: number[] = [];
  for (let index = 0; index < size; index++) {
    const byte = map.bytes.get(address + index);
    if (byte === undefined) return undefined;
    bytes.push(byte);
  }
  return bytes;
}

function evalStaticLoweredImmExpr(expr: LoweredImmExpr): number | undefined {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'symbol':
    case 'opaque':
      return undefined;
    case 'unary': {
      const value = evalStaticLoweredImmExpr(expr.expr);
      if (value === undefined) return undefined;
      switch (expr.op) {
        case '+':
          return +value;
        case '-':
          return -value;
        case '~':
          return ~value;
      }
    }
    case 'binary': {
      const left = evalStaticLoweredImmExpr(expr.left);
      const right = evalStaticLoweredImmExpr(expr.right);
      if (left === undefined || right === undefined) return undefined;
      switch (expr.op) {
        case '*':
          return left * right;
        case '/':
          return right === 0 ? undefined : Math.trunc(left / right);
        case '%':
          return right === 0 ? undefined : left % right;
        case '+':
          return left + right;
        case '-':
          return left - right;
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
  }
}

function loweredItemSize(item: LoweredAsmItem): number {
  switch (item.kind) {
    case 'label':
    case 'const':
    case 'comment':
      return 0;
    case 'db':
      return item.values.length;
    case 'dw':
      return item.values.length * 2;
    case 'ds':
      return Math.max(0, evalStaticLoweredImmExpr(item.size) ?? 0);
    case 'instr':
      return item.bytes?.length ?? 0;
  }
}

export function flattenLoweredInstructions(
  program: LoweredAsmProgram,
  map?: EmittedByteMap,
): LoweredInstrView[] {
  const out: LoweredInstrView[] = [];
  for (const block of program.blocks) {
    let offset = 0;
    for (let itemIndex = 0; itemIndex < block.items.length; itemIndex++) {
      const item = block.items[itemIndex]!;
      const address = block.origin + offset;
      if (item.kind === 'instr') {
        const size = loweredItemSize(item);
        const view: LoweredInstrView = {
          head: item.head,
          operands: item.operands,
          block,
          address,
          size,
          itemIndex,
        };
        if (item.bytes) view.bytes = item.bytes;
        const resolvedBytes = map ? readResolvedBytes(map, address, size) : undefined;
        if (resolvedBytes) view.resolvedBytes = resolvedBytes;
        out.push(view);
      }
      offset += loweredItemSize(item);
    }
  }
  return out;
}

export function flattenLoweredLabels(program: LoweredAsmProgram): LoweredLabelView[] {
  const out: LoweredLabelView[] = [];
  for (const block of program.blocks) {
    let offset = 0;
    for (let itemIndex = 0; itemIndex < block.items.length; itemIndex++) {
      const item = block.items[itemIndex]!;
      const address = block.origin + offset;
      if (item.kind === 'label') {
        out.push({ name: item.name, address, block, itemIndex });
      }
      offset += loweredItemSize(item);
    }
  }
  return out;
}

export function findLoweredLabel(program: LoweredAsmProgram, name: string): LoweredLabelView | undefined {
  return flattenLoweredLabels(program).find((label) => label.name.toUpperCase() === name.toUpperCase());
}

export function findLoweredBlock(
  program: LoweredAsmProgram,
  matcher: LoweredBlockMatcher,
): LoweredAsmBlock | undefined {
  return program.blocks.find((block) =>
    Object.entries(matcher).every(([key, value]) => block[key as keyof LoweredBlockMatcher] === value),
  );
}

export function flattenLoweredItems(program: LoweredAsmProgram): LoweredAsmItem[] {
  const out: LoweredAsmItem[] = [];
  for (const block of program.blocks) {
    out.push(...block.items);
  }
  return out;
}

export function instructionsInLabelRange(
  value: LoweredAsmProgram | CompiledLoweredProgram,
  startLabel: string,
  endLabel?: string,
): LoweredInstrView[] {
  const program = getProgram(value);
  const map = getMap(value);
  const start = findLoweredLabel(program, startLabel);
  if (!start) return [];
  const end = endLabel ? findLoweredLabel(program, endLabel) : undefined;
  if (end && end.block !== start.block) return [];
  return flattenLoweredInstructions(program, map).filter(
    (instr) =>
      instr.block === start.block &&
      instr.itemIndex > start.itemIndex &&
      (end ? instr.itemIndex < end.itemIndex : true),
  );
}
