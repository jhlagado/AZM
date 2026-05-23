import type { Diagnostic } from '../diagnosticTypes.js';
import type { CompileEnv } from '../semantics/env.js';
import type { LoweredAsmProgram, LoweredAsmItem, LoweredImmExpr } from './loweredAsmTypes.js';
import type { PlacementKind } from './loweringTypes.js';
import { resolveAsmEquSymbol } from './asmEquResolution.js';
import { evalBinaryImmOp, evalUnaryImmOp } from './immMath.js';

type LoweredAsmByteEmissionContext = {
  diagnostics: Diagnostic[];
  diag: (diagnostics: Diagnostic[], file: string, message: string) => void;
  primaryFile: string;
  env: CompileEnv;
};

type LoweredAsmByteEmissionResult = {
  codeBytes: Map<number, number>;
  dataBytes: Map<number, number>;
  blockSizesByKey: Map<string, number>;
  maxAddress: number;
};

const toByte = (value: number): number => value & 0xff;
const toWord = (value: number): number => value & 0xffff;

function evalLoweredImmExpr(expr: LoweredImmExpr, env: CompileEnv): number | undefined {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'symbol': {
      const direct = env.equates.get(expr.name) ?? env.enums.get(expr.name);
      if (direct !== undefined) return direct + expr.addend;
      const lower = expr.name.toLowerCase();
      const alt = env.equates.get(lower) ?? env.enums.get(lower);
      if (alt !== undefined) return alt + expr.addend;
      const asmAlias = resolveAsmEquSymbol(expr.name, { env });
      if (asmAlias !== undefined) return asmAlias + expr.addend;
      return undefined;
    }
    case 'unary': {
      const value = evalLoweredImmExpr(expr.expr, env);
      if (value === undefined) return undefined;
      return evalUnaryImmOp(expr.op, value);
    }
    case 'binary': {
      const left = evalLoweredImmExpr(expr.left, env);
      const right = evalLoweredImmExpr(expr.right, env);
      if (left === undefined || right === undefined) return undefined;
      return evalBinaryImmOp(expr.op, left, right);
    }
    case 'opaque':
      return undefined;
  }
}

function blockPlacementKey(placement: PlacementKind): string {
  return `base:${placement}`;
}

/** Byte length of a lowered item as emitted into a placement (matches {@link emitLoweredAsmItemBytes}). */
function loweredAsmItemEmittedSize(item: LoweredAsmItem, env: CompileEnv): number {
  switch (item.kind) {
    case 'label':
    case 'const':
    case 'comment':
      return 0;
    case 'db':
      return item.values.length;
    case 'dw':
      return item.values.length * 2;
    case 'ds': {
      const size = evalLoweredImmExpr(item.size, env);
      if (size === undefined || size < 0) return 0;
      return size;
    }
    case 'instr':
      return item.bytes?.length ?? 0;
  }
}

/**
 * After link-time fixups are applied to `finalBytes`, patch lowered `instr` byte arrays
 * (including `@raw` placeholders from abs16/rel8 fixups) so ASM80 listings match the
 * merged image.
 */
export function syncLoweredAsmInstructionBytesFromFinalBytes(
  program: LoweredAsmProgram,
  finalBytes: Map<number, number>,
  env: CompileEnv,
): void {
  for (const block of program.blocks) {
    if (block.kind !== 'placed') continue;
    let offset = 0;
    const origin = block.origin;
    for (const item of block.items) {
      if (item.kind === 'instr' && item.bytes && item.bytes.length > 0) {
        const base = origin + offset;
        for (let i = 0; i < item.bytes.length; i++) {
          const b = finalBytes.get(base + i);
          if (b !== undefined) item.bytes[i] = b;
        }
      }
      offset += loweredAsmItemEmittedSize(item, env);
    }
  }
}

function emitLoweredAsmItemBytes(
  item: LoweredAsmItem,
  ctx: LoweredAsmByteEmissionContext,
  bytes: Map<number, number>,
  origin: number,
  offsetRef: { current: number },
  maxAddressRef: { current: number },
): void {
  const updateMax = (addr: number): void => {
    if (addr > maxAddressRef.current) maxAddressRef.current = addr;
  };

  const emitByte = (value: number): void => {
    const offset = offsetRef.current;
    bytes.set(offset, toByte(value));
    updateMax(origin + offset);
    offsetRef.current++;
  };
  const emitWord = (value: number): void => {
    const v = toWord(value);
    emitByte(v & 0xff);
    emitByte((v >> 8) & 0xff);
  };

  switch (item.kind) {
    case 'label':
    case 'const':
    case 'comment':
      return;
    case 'db':
      for (const value of item.values) {
        const v = evalLoweredImmExpr(value, ctx.env);
        if (v === undefined) {
          ctx.diag(ctx.diagnostics, ctx.primaryFile, 'Failed to evaluate lowered byte value.');
          emitByte(0);
        } else {
          emitByte(v);
        }
      }
      return;
    case 'dw':
      for (const value of item.values) {
        const v = evalLoweredImmExpr(value, ctx.env);
        if (v === undefined) {
          ctx.diag(ctx.diagnostics, ctx.primaryFile, 'Failed to evaluate lowered word value.');
          emitWord(0);
        } else {
          emitWord(v);
        }
      }
      return;
    case 'ds': {
      const size = evalLoweredImmExpr(item.size, ctx.env);
      if (size === undefined || size < 0) {
        ctx.diag(ctx.diagnostics, ctx.primaryFile, 'Failed to evaluate lowered reserve size.');
        return;
      }
      if (item.fill === undefined) {
        offsetRef.current += size;
        return;
      }
      const fillValue = evalLoweredImmExpr(item.fill, ctx.env) ?? 0;
      for (let i = 0; i < size; i++) emitByte(fillValue);
      return;
    }
    case 'instr': {
      if (!item.bytes) {
        ctx.diag(ctx.diagnostics, ctx.primaryFile, `Lowered instruction missing encoded bytes.`);
        return;
      }
      for (const b of item.bytes) emitByte(b);
      return;
    }
  }
}

export function emitLoweredAsmProgramBytes(
  program: LoweredAsmProgram,
  ctx: LoweredAsmByteEmissionContext,
): LoweredAsmByteEmissionResult {
  const codeBytes = new Map<number, number>();
  const dataBytes = new Map<number, number>();
  const blockSizesByKey = new Map<string, number>();
  const maxAddressRef = { current: -1 };

  for (const block of program.blocks) {
    if (block.kind !== 'placed') continue;
    const placement = block.placement ?? 'code';
    const key = blockPlacementKey(placement);
    const target =
      placement === 'code'
        ? codeBytes
        : placement === 'data'
          ? dataBytes
          : new Map<number, number>();

    const offsetRef = { current: 0 };
    for (const item of block.items) {
      emitLoweredAsmItemBytes(item, ctx, target, block.origin, offsetRef, maxAddressRef);
    }
    blockSizesByKey.set(key, offsetRef.current);
  }

  return {
    codeBytes,
    dataBytes,
    blockSizesByKey,
    maxAddress: maxAddressRef.current,
  };
}
