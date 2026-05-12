import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';

export type CoreOpsEncodeContext = {
  diag: (
    diagnostics: Diagnostic[],
    node: { span: { file: string; start: { line: number; column: number } } },
    message: string,
  ) => void;
  regName: (op: AsmOperandNode) => string | undefined;
  indexedReg8: (
    op: AsmOperandNode,
  ) => { prefix: number; code: number; display: 'IXH' | 'IXL' | 'IYH' | 'IYL' } | undefined;
  reg8Code: (name: string) => number | undefined;
  isMemHL: (op: AsmOperandNode) => boolean;
  memIndexed: (op: AsmOperandNode, env: CompileEnv) => { prefix: number; disp: number } | undefined;
};

function isMemSP(op: AsmOperandNode): op is AsmOperandNode & { kind: 'Mem'; expr: EaExprNode } {
  return op.kind === 'Mem' && op.expr.kind === 'EaName' && op.expr.name.toUpperCase() === 'SP';
}

export function encodeCoreOpsInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: CoreOpsEncodeContext,
): Uint8Array | undefined {
  const head = node.head.toLowerCase();
  const ops = node.operands;

  if (head === 'inc' && ops.length === 1) {
    const indexed = ctx.indexedReg8(ops[0]!);
    if (indexed) return Uint8Array.of(indexed.prefix, 0x04 + (indexed.code << 3));
    const r = ctx.regName(ops[0]!);
    if (r) {
      const r8 = ctx.reg8Code(r);
      if (r8 !== undefined) {
        return Uint8Array.of(0x04 + (r8 << 3));
      }
      switch (r) {
        case 'BC':
          return Uint8Array.of(0x03);
        case 'DE':
          return Uint8Array.of(0x13);
        case 'HL':
          return Uint8Array.of(0x23);
        case 'SP':
          return Uint8Array.of(0x33);
        case 'IX':
          return Uint8Array.of(0xdd, 0x23);
        case 'IY':
          return Uint8Array.of(0xfd, 0x23);
      }
    }
    if (ctx.isMemHL(ops[0]!)) return Uint8Array.of(0x34);
    const idx = ctx.memIndexed(ops[0]!, env);
    if (idx) {
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        ctx.diag(diagnostics, node, `inc (ix/iy+disp) expects disp8`);
        return undefined;
      }
      return Uint8Array.of(idx.prefix, 0x34, disp & 0xff);
    }
    ctx.diag(diagnostics, node, `inc expects r8/rr/(hl) operand`);
    return undefined;
  }

  if (head === 'dec' && ops.length === 1) {
    const indexed = ctx.indexedReg8(ops[0]!);
    if (indexed) return Uint8Array.of(indexed.prefix, 0x05 + (indexed.code << 3));
    const r = ctx.regName(ops[0]!);
    if (r) {
      const r8 = ctx.reg8Code(r);
      if (r8 !== undefined) {
        return Uint8Array.of(0x05 + (r8 << 3));
      }
      switch (r) {
        case 'BC':
          return Uint8Array.of(0x0b);
        case 'DE':
          return Uint8Array.of(0x1b);
        case 'HL':
          return Uint8Array.of(0x2b);
        case 'SP':
          return Uint8Array.of(0x3b);
        case 'IX':
          return Uint8Array.of(0xdd, 0x2b);
        case 'IY':
          return Uint8Array.of(0xfd, 0x2b);
      }
    }
    if (ctx.isMemHL(ops[0]!)) return Uint8Array.of(0x35);
    const idx = ctx.memIndexed(ops[0]!, env);
    if (idx) {
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        ctx.diag(diagnostics, node, `dec (ix/iy+disp) expects disp8`);
        return undefined;
      }
      return Uint8Array.of(idx.prefix, 0x35, disp & 0xff);
    }
    ctx.diag(diagnostics, node, `dec expects r8/rr/(hl) operand`);
    return undefined;
  }

  if (head === 'push' && ops.length === 1) {
    const r16 = ctx.regName(ops[0]!);
    if (!r16) {
      ctx.diag(diagnostics, node, `push expects reg16`);
      return undefined;
    }
    switch (r16) {
      case 'BC':
        return Uint8Array.of(0xc5);
      case 'DE':
        return Uint8Array.of(0xd5);
      case 'HL':
        return Uint8Array.of(0xe5);
      case 'AF':
        return Uint8Array.of(0xf5);
      case 'IX':
        return Uint8Array.of(0xdd, 0xe5);
      case 'IY':
        return Uint8Array.of(0xfd, 0xe5);
      default:
        ctx.diag(diagnostics, node, `push supports BC/DE/HL/AF/IX/IY only`);
        return undefined;
    }
  }

  if (head === 'pop' && ops.length === 1) {
    const r16 = ctx.regName(ops[0]!);
    if (!r16) {
      ctx.diag(diagnostics, node, `pop expects reg16`);
      return undefined;
    }
    switch (r16) {
      case 'BC':
        return Uint8Array.of(0xc1);
      case 'DE':
        return Uint8Array.of(0xd1);
      case 'HL':
        return Uint8Array.of(0xe1);
      case 'AF':
        return Uint8Array.of(0xf1);
      case 'IX':
        return Uint8Array.of(0xdd, 0xe1);
      case 'IY':
        return Uint8Array.of(0xfd, 0xe1);
      default:
        ctx.diag(diagnostics, node, `pop supports BC/DE/HL/AF/IX/IY only`);
        return undefined;
    }
  }

  if (head === 'ex' && ops.length === 2) {
    const a = ctx.regName(ops[0]!);
    const b = ctx.regName(ops[1]!);
    if ((a === "AF'" && b === 'AF') || (a === 'AF' && b === "AF'")) return Uint8Array.of(0x08);
    if ((a === 'DE' && b === 'HL') || (a === 'HL' && b === 'DE')) return Uint8Array.of(0xeb);
    if ((isMemSP(ops[0]!) && b === 'HL') || (isMemSP(ops[1]!) && a === 'HL')) {
      return Uint8Array.of(0xe3);
    }
    if ((isMemSP(ops[0]!) && b === 'IX') || (isMemSP(ops[1]!) && a === 'IX')) {
      return Uint8Array.of(0xdd, 0xe3);
    }
    if ((isMemSP(ops[0]!) && b === 'IY') || (isMemSP(ops[1]!) && a === 'IY')) {
      return Uint8Array.of(0xfd, 0xe3);
    }
    ctx.diag(
      diagnostics,
      node,
      `ex supports "AF, AF'", "DE, HL", "(SP), HL", "(SP), IX", and "(SP), IY" only`,
    );
    return undefined;
  }

  return undefined;
}
