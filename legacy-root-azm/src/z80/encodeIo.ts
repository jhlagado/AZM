import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EncoderImmContext, EncoderRegisterContext } from './encodeContext.js';

type IoEncodeContext = EncoderRegisterContext &
  EncoderImmContext & {
    portImmValue: (op: AsmOperandNode, env: CompileEnv) => number | undefined;
  };

function outSourceReg8(
  node: AsmInstructionNode,
  diagnostics: Diagnostic[],
  ctx: IoEncodeContext,
  operand: AsmOperandNode,
): { name: string; code: number } | undefined {
  const name = ctx.regName(operand);
  const code = name ? ctx.reg8Code(name) : undefined;
  if (name !== undefined && code !== undefined) return { name, code };

  if (ctx.indexedReg8(operand)) {
    ctx.diag(diagnostics, node, `out source must use plain reg8 B/C/D/E/H/L/A`);
    return undefined;
  }
  ctx.diag(diagnostics, node, `out expects a reg8 source`);
  return undefined;
}

function immediatePortByte(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: IoEncodeContext,
  port: AsmOperandNode,
  message: string,
): number | undefined {
  const n = ctx.portImmValue(port, env);
  if (n === undefined || !ctx.fitsImm8(n)) {
    ctx.diag(diagnostics, node, message);
    return undefined;
  }
  return n & 0xff;
}

export function encodeIoInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: IoEncodeContext,
): Uint8Array | undefined {
  const head = node.head.toLowerCase();
  const ops = node.operands;

  if (head === 'rst' && ops.length === 1) {
    const n = ctx.immValue(ops[0]!, env);
    if (n === undefined || n < 0 || n > 0x38 || (n & 0x07) !== 0) {
      ctx.diag(diagnostics, node, `rst expects an imm8 multiple of 8 (0..56)`);
      return undefined;
    }
    return Uint8Array.of(0xc7 + n);
  }
  if (head === 'rst') {
    ctx.diag(diagnostics, node, `rst expects one operand`);
    return undefined;
  }

  if (head === 'im' && ops.length === 1) {
    const n = ctx.immValue(ops[0]!, env);
    if (n === 0) return Uint8Array.of(0xed, 0x46);
    if (n === 1) return Uint8Array.of(0xed, 0x56);
    if (n === 2) return Uint8Array.of(0xed, 0x5e);
    ctx.diag(diagnostics, node, `im expects 0, 1, or 2`);
    return undefined;
  }
  if (head === 'im') {
    ctx.diag(diagnostics, node, `im expects one operand`);
    return undefined;
  }

  if (head === 'in' && ops.length === 1) {
    if (ops[0]!.kind === 'PortC') {
      return Uint8Array.of(0xed, 0x70);
    }
    ctx.diag(diagnostics, node, `in (c) is the only one-operand in form`);
    return undefined;
  }

  if (head === 'in' && ops.length === 2) {
    const dst = ctx.regName(ops[0]!);
    const dst8 = dst ? ctx.reg8Code(dst) : undefined;

    if (dst8 === undefined) {
      if (ctx.indexedReg8(ops[0]!)) {
        ctx.diag(diagnostics, node, `in destination must use plain reg8 B/C/D/E/H/L/A`);
        return undefined;
      }
      ctx.diag(diagnostics, node, `in expects a reg8 destination`);
      return undefined;
    }

    const port = ops[1]!;
    if (port.kind === 'PortC') {
      return Uint8Array.of(0xed, 0x40 + (dst8 << 3));
    }
    if (port.kind === 'PortImm8') {
      if (dst !== 'A') {
        ctx.diag(diagnostics, node, `in a,(n) immediate port form requires destination A`);
        return undefined;
      }
      const n = immediatePortByte(
        node,
        env,
        diagnostics,
        ctx,
        port,
        `in a,(n) expects an imm8 port number`,
      );
      if (n === undefined) return undefined;
      return Uint8Array.of(0xdb, n);
    }

    ctx.diag(diagnostics, node, `in expects a port operand (c) or (imm8)`);
    return undefined;
  }
  if (head === 'in') {
    ctx.diag(diagnostics, node, `in expects one or two operands`);
    return undefined;
  }

  if (head === 'out' && ops.length === 2) {
    const port = ops[0]!;
    const srcOp = ops[1]!;

    if (port.kind === 'PortC') {
      if (srcOp.kind === 'Imm') {
        const n = ctx.immValue(srcOp, env);
        if (n === 0) {
          return Uint8Array.of(0xed, 0x71);
        }
        ctx.diag(diagnostics, node, `out (c), n immediate form supports n=0 only`);
        return undefined;
      }
      const src = outSourceReg8(node, diagnostics, ctx, srcOp);
      if (!src) return undefined;
      return Uint8Array.of(0xed, 0x41 + (src.code << 3));
    }
    if (port.kind === 'PortImm8') {
      const src = outSourceReg8(node, diagnostics, ctx, srcOp);
      if (!src) return undefined;
      if (src.name !== 'A') {
        ctx.diag(diagnostics, node, `out (n),a immediate port form requires source A`);
        return undefined;
      }
      const n = immediatePortByte(
        node,
        env,
        diagnostics,
        ctx,
        port,
        `out (n),a expects an imm8 port number`,
      );
      if (n === undefined) return undefined;
      return Uint8Array.of(0xd3, n);
    }

    ctx.diag(diagnostics, node, `out expects a port operand (c) or (imm8)`);
    return undefined;
  }
  if (head === 'out') {
    ctx.diag(diagnostics, node, `out expects two operands`);
    return undefined;
  }

  return undefined;
}
