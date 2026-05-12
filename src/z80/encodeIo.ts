import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';

export type IoEncodeContext = {
  diag: (
    diagnostics: Diagnostic[],
    node: { span: { file: string; start: { line: number; column: number } } },
    message: string,
  ) => void;
  regName: (op: AsmOperandNode) => string | undefined;
  immValue: (op: AsmOperandNode, env: CompileEnv) => number | undefined;
  portImmValue: (op: AsmOperandNode, env: CompileEnv) => number | undefined;
  indexedReg8: (
    op: AsmOperandNode,
  ) => { prefix: number; code: number; display: 'IXH' | 'IXL' | 'IYH' | 'IYL' } | undefined;
  reg8Code: (name: string) => number | undefined;
  fitsImm8: (value: number) => boolean;
};

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
        ctx.diag(diagnostics, node, `in destination must use legacy reg8 B/C/D/E/H/L/A`);
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
      const n = ctx.portImmValue(port, env);
      if (n === undefined || !ctx.fitsImm8(n)) {
        ctx.diag(diagnostics, node, `in a,(n) expects an imm8 port number`);
        return undefined;
      }
      return Uint8Array.of(0xdb, n & 0xff);
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
    const src = ctx.regName(ops[1]!);
    const src8 = src ? ctx.reg8Code(src) : undefined;
    const srcIndexed = ctx.indexedReg8(ops[1]!);

    if (port.kind === 'PortC') {
      if (ops[1]!.kind === 'Imm') {
        const n = ctx.immValue(ops[1]!, env);
        if (n === 0) {
          return Uint8Array.of(0xed, 0x71);
        }
        ctx.diag(diagnostics, node, `out (c), n immediate form supports n=0 only`);
        return undefined;
      }
      if (src8 === undefined) {
        if (srcIndexed) {
          ctx.diag(diagnostics, node, `out source must use legacy reg8 B/C/D/E/H/L/A`);
          return undefined;
        }
        ctx.diag(diagnostics, node, `out expects a reg8 source`);
        return undefined;
      }
      return Uint8Array.of(0xed, 0x41 + (src8 << 3));
    }
    if (port.kind === 'PortImm8') {
      if (src8 === undefined) {
        if (srcIndexed) {
          ctx.diag(diagnostics, node, `out source must use legacy reg8 B/C/D/E/H/L/A`);
          return undefined;
        }
        ctx.diag(diagnostics, node, `out expects a reg8 source`);
        return undefined;
      }
      if (src !== 'A') {
        ctx.diag(diagnostics, node, `out (n),a immediate port form requires source A`);
        return undefined;
      }
      const n = ctx.portImmValue(port, env);
      if (n === undefined || !ctx.fitsImm8(n)) {
        ctx.diag(diagnostics, node, `out (n),a expects an imm8 port number`);
        return undefined;
      }
      return Uint8Array.of(0xd3, n & 0xff);
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
