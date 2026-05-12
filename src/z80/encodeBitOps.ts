import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';

export type BitOpsEncodeContext = {
  diag: (
    diagnostics: Diagnostic[],
    node: { span: { file: string; start: { line: number; column: number } } },
    message: string,
  ) => void;
  regName: (op: AsmOperandNode) => string | undefined;
  immValue: (op: AsmOperandNode, env: CompileEnv) => number | undefined;
  indexedReg8: (
    op: AsmOperandNode,
  ) => { prefix: number; code: number; display: 'IXH' | 'IXL' | 'IYH' | 'IYL' } | undefined;
  reg8Code: (name: string) => number | undefined;
  isMemHL: (op: AsmOperandNode) => boolean;
  memIndexed: (op: AsmOperandNode, env: CompileEnv) => { prefix: number; disp: number } | undefined;
};

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
            `${mnemonic} indexed destination must use legacy reg8 B/C/D/E/H/L/A`,
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
          `${mnemonic} indexed destination must use legacy reg8 B/C/D/E/H/L/A`,
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

  if (head === 'bit') {
    const encoded = encodeBitLike(node, env, diagnostics, ctx, 0x40, 'bit');
    if (encoded) return encoded;
    if (ops.length === 2) return undefined;
  }
  if (head === 'res') {
    const encoded = encodeBitLike(node, env, diagnostics, ctx, 0x80, 'res', true);
    if (encoded) return encoded;
    if (ops.length === 2 || ops.length === 3) return undefined;
  }
  if (head === 'set') {
    const encoded = encodeBitLike(node, env, diagnostics, ctx, 0xc0, 'set', true);
    if (encoded) return encoded;
    if (ops.length === 2 || ops.length === 3) return undefined;
  }

  if (head === 'rl') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x10, 'rl');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'rr') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x18, 'rr');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'sla') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x20, 'sla');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'sra') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x28, 'sra');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'srl') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x38, 'srl');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'sll') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x30, 'sll');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'rlc') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x00, 'rlc');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'rrc') {
    const encoded = encodeCbRotateShift(node, env, diagnostics, ctx, 0x08, 'rrc');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  return undefined;
}
