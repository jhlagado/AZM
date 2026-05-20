import type { Diagnostic } from '../diagnosticTypes.js';
import type { SectionKind } from './loweringTypes.js';
import type {
  LoweredAsmBlock,
  LoweredAsmItem,
  LoweredAsmProgram,
  LoweredImmExpr,
  LoweredAsmStream,
  LoweredAsmStreamBlock,
} from './loweredAsmTypes.js';

export type LoweredAsmPlacementContext = {
  diagnostics: Diagnostic[];
  diag: (diagnostics: Diagnostic[], file: string, message: string) => void;
  primaryFile: string;
  baseAddresses: {
    codeBase: number;
    dataBase: number;
    varBase: number;
  };
};

function baseOriginForSection(
  section: SectionKind,
  baseAddresses: LoweredAsmPlacementContext['baseAddresses'],
): number {
  switch (section) {
    case 'code':
      return baseAddresses.codeBase;
    case 'data':
      return baseAddresses.dataBase;
    case 'var':
      return baseAddresses.varBase;
  }
}

function resolveBlockOrigin(block: LoweredAsmStreamBlock, ctx: LoweredAsmPlacementContext): number {
  return baseOriginForSection(block.section, ctx.baseAddresses);
}

export function placeLoweredAsmStream(
  stream: LoweredAsmStream,
  ctx: LoweredAsmPlacementContext,
): LoweredAsmProgram {
  const blocks: LoweredAsmBlock[] = [];
  for (const block of stream.blocks) {
    blocks.push({
      kind: 'section',
      origin: resolveBlockOrigin(block, ctx),
      section: block.section,
      items: block.items,
    });
  }
  resolvePlacedLoweredDataSymbols(blocks);
  return { blocks };
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
      return item.size.kind === 'literal' && item.size.value > 0 ? item.size.value : 0;
    case 'instr':
      return item.bytes?.length ?? 0;
  }
}

function evalPlacedConst(expr: LoweredImmExpr, values: Map<string, number>): number | undefined {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'symbol': {
      const base = values.get(expr.name.toLowerCase());
      return base === undefined ? undefined : base + expr.addend;
    }
    case 'unary': {
      const value = evalPlacedConst(expr.expr, values);
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
      const left = evalPlacedConst(expr.left, values);
      const right = evalPlacedConst(expr.right, values);
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
    case 'opaque':
      return undefined;
  }
}

function resolvePlacedExpr(expr: LoweredImmExpr, values: Map<string, number>): LoweredImmExpr {
  const resolved = evalPlacedConst(expr, values);
  return resolved === undefined ? expr : { kind: 'literal', value: resolved };
}

function resolvePlacedLoweredDataSymbols(blocks: LoweredAsmBlock[]): void {
  const values = new Map<string, number>();

  for (const block of blocks) {
    let offset = 0;
    for (const item of block.items) {
      if (item.kind === 'label') values.set(item.name.toLowerCase(), block.origin + offset);
      if (item.kind === 'const') {
        const resolved = evalPlacedConst(item.value, values);
        if (resolved !== undefined) values.set(item.name.toLowerCase(), resolved);
      }
      offset += loweredItemSize(item);
    }
  }

  for (const block of blocks) {
    for (const item of block.items) {
      if (item.kind === 'db' || item.kind === 'dw') {
        item.values = item.values.map((value) => resolvePlacedExpr(value, values));
      } else if (item.kind === 'ds') {
        item.size = resolvePlacedExpr(item.size, values);
        if (item.fill) item.fill = resolvePlacedExpr(item.fill, values);
      } else if (item.kind === 'const') {
        item.value = resolvePlacedExpr(item.value, values);
      }
    }
  }
}
