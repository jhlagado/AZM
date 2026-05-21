import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EncoderImmContext, EncoderMemContext, EncoderRegisterContext } from './encodeContext.js';

type BitOpsEncodeContext = EncoderRegisterContext & Pick<EncoderImmContext, 'immValue'> & EncoderMemContext;

const BIT_LIKE_OPS = {
  bit: { base: 0x40, allowIndexedDestination: false },
  res: { base: 0x80, allowIndexedDestination: true },
  set: { base: 0xc0, allowIndexedDestination: true },
} as const;

const ROTATE_SHIFT_OPS = {
  rlc: 0x00,
  rrc: 0x08,
  rl: 0x10,
  rr: 0x18,
  sla: 0x20,
  sra: 0x28,
  sll: 0x30,
  srl: 0x38,
} as const;

function encodeBitLike(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: BitOpsEncodeContext,
  base: number,
  mnemonic: string,
  allowIndexedDestination = false,
): Uint8Array | undefined {
  const ops = node.operands;
  if (ops.length !== 2 && !(allowIndexedDestination && ops.length === 3)) return undefined;

  const bit = ctx.immValue(ops[0]!, env);
  if (bit === undefined || bit < 0 || bit > 7) {
    ctx.diag(diagnostics, node, `${mnemonic} expects bit index 0..7`);
    return undefined;
  }
  const src = ops[1]!;
  const idx = ctx.memIndexed(src, env);
  if (idx) {
    const disp = idx.disp;
    if (disp < -128 || disp > 127) {
      ctx.diag(diagnostics, node, `${mnemonic} (ix/iy+disp) expects disp8`);
      return undefined;
    }
    if (ops.length === 3) {
      const dstIndexed = ctx.indexedReg8(ops[2]!);
      if (dstIndexed) {
        if (dstIndexed.prefix !== idx.prefix) {
          ctx.diag(
            diagnostics,
            node,
            `${mnemonic} indexed destination family must match source index base`,
          );
        } else {
          ctx.diag(
            diagnostics,
            node,
            `${mnemonic} indexed destination must use plain reg8 B/C/D/E/H/L/A`,
          );
        }
        return undefined;
      }
      const dstReg = ctx.regName(ops[2]!);
      const dstCode = dstReg ? ctx.reg8Code(dstReg) : undefined;
      if (dstCode === undefined) {
        ctx.diag(diagnostics, node, `${mnemonic} b,(ix/iy+disp),r expects reg8 destination`);
        return undefined;
      }
      return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + (bit << 3) + dstCode);
    }
    return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + (bit << 3) + 0x06);
  }
  if (ops.length === 3) {
    ctx.diag(diagnostics, node, `${mnemonic} b,(ix/iy+disp),r requires an indexed memory source`);
    return undefined;
  }
  if (ctx.isMemHL(src)) {
    return Uint8Array.of(0xcb, base + (bit << 3) + 0x06);
  }
  const reg = ctx.regName(src);
  const code = reg ? ctx.reg8Code(reg) : undefined;
  if (code === undefined) {
    ctx.diag(diagnostics, node, `${mnemonic} expects reg8 or (hl)`);
    return undefined;
  }
  return Uint8Array.of(0xcb, base + (bit << 3) + code);
}

function encodeCbRotateShift(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: BitOpsEncodeContext,
  base: number,
  mnemonic: string,
): Uint8Array | undefined {
  const ops = node.operands;
  if (ops.length !== 1 && ops.length !== 2) return undefined;

  const operand = ops[0]!;
  const idx = ctx.memIndexed(operand, env);
  if (idx) {
    const disp = idx.disp;
    if (disp < -128 || disp > 127) {
      ctx.diag(diagnostics, node, `${mnemonic} (ix/iy+disp) expects disp8`);
      return undefined;
    }
    if (ops.length === 1) {
      return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + 0x06);
    }
    const dstIndexed = ctx.indexedReg8(ops[1]!);
    if (dstIndexed) {
      if (dstIndexed.prefix !== idx.prefix) {
        ctx.diag(
          diagnostics,
          node,
          `${mnemonic} indexed destination family must match source index base`,
        );
      } else {
        ctx.diag(
          diagnostics,
          node,
          `${mnemonic} indexed destination must use plain reg8 B/C/D/E/H/L/A`,
        );
      }
      return undefined;
    }
    const dstReg = ctx.regName(ops[1]!);
    const dstCode = dstReg ? ctx.reg8Code(dstReg) : undefined;
    if (dstCode === undefined) {
      ctx.diag(diagnostics, node, `${mnemonic} (ix/iy+disp),r expects reg8 destination`);
      return undefined;
    }
    return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + dstCode);
  }
  if (ops.length === 2) {
    ctx.diag(diagnostics, node, `${mnemonic} two-operand form requires (ix/iy+disp) source`);
    return undefined;
  }
  if (ctx.isMemHL(operand)) return Uint8Array.of(0xcb, base + 0x06);
  const reg = ctx.regName(operand);
  const code = reg ? ctx.reg8Code(reg) : undefined;
  if (code === undefined) {
    ctx.diag(diagnostics, node, `${mnemonic} expects reg8 or (hl)`);
    return undefined;
  }
  return Uint8Array.of(0xcb, base + code);
}

export function encodeBitOpsInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: BitOpsEncodeContext,
): Uint8Array | undefined {
  const head = node.head.toLowerCase();
  const ops = node.operands;

  const bitLike = BIT_LIKE_OPS[head as keyof typeof BIT_LIKE_OPS];
  if (bitLike) {
    const encoded = encodeBitLike(
      node,
      env,
      diagnostics,
      ctx,
      bitLike.base,
      head,
      bitLike.allowIndexedDestination,
    );
    if (encoded) return encoded;
    if (ops.length === 2 || (bitLike.allowIndexedDestination && ops.length === 3)) return undefined;
  }

  const rotateShiftBase = ROTATE_SHIFT_OPS[head as keyof typeof ROTATE_SHIFT_OPS];
  if (rotateShiftBase !== undefined) {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, rotateShiftBase, head);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  return undefined;
}
