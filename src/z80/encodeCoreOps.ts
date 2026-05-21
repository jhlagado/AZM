import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EncoderMemContext, EncoderRegisterContext } from './encodeContext.js';

type CoreOpsEncodeContext = EncoderRegisterContext & EncoderMemContext;

function isMemSP(op: AsmOperandNode): op is AsmOperandNode & { kind: 'Mem'; expr: EaExprNode } {
  return op.kind === 'Mem' && op.expr.kind === 'EaName' && op.expr.name.toUpperCase() === 'SP';
}

type IncDecSpec = {
  mnemonic: 'inc' | 'dec';
  reg8Base: number;
  memOpcode: number;
  reg16Opcodes: Readonly<Record<string, number | readonly [number, number]>>;
};

const INC_SPEC: IncDecSpec = {
  mnemonic: 'inc',
  reg8Base: 0x04,
  memOpcode: 0x34,
  reg16Opcodes: {
    BC: 0x03,
    DE: 0x13,
    HL: 0x23,
    SP: 0x33,
    IX: [0xdd, 0x23],
    IY: [0xfd, 0x23],
  },
};

const DEC_SPEC: IncDecSpec = {
  mnemonic: 'dec',
  reg8Base: 0x05,
  memOpcode: 0x35,
  reg16Opcodes: {
    BC: 0x0b,
    DE: 0x1b,
    HL: 0x2b,
    SP: 0x3b,
    IX: [0xdd, 0x2b],
    IY: [0xfd, 0x2b],
  },
};

function encodeIncDec(
  node: AsmInstructionNode,
  operand: AsmOperandNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: CoreOpsEncodeContext,
  spec: IncDecSpec,
): Uint8Array | undefined {
  const indexed = ctx.indexedReg8(operand);
  if (indexed) return Uint8Array.of(indexed.prefix, spec.reg8Base + (indexed.code << 3));
  const r = ctx.regName(operand);
  if (r) {
    const r8 = ctx.reg8Code(r);
    if (r8 !== undefined) {
      return Uint8Array.of(spec.reg8Base + (r8 << 3));
    }
    const reg16Opcode = spec.reg16Opcodes[r];
    if (typeof reg16Opcode === 'number') return Uint8Array.of(reg16Opcode);
    if (reg16Opcode) return Uint8Array.of(...reg16Opcode);
  }
  if (ctx.isMemHL(operand)) return Uint8Array.of(spec.memOpcode);
  const idx = ctx.memIndexed(operand, env);
  if (idx) {
    const disp = idx.disp;
    if (disp < -128 || disp > 127) {
      ctx.diag(diagnostics, node, `${spec.mnemonic} (ix/iy+disp) expects disp8`);
      return undefined;
    }
    return Uint8Array.of(idx.prefix, spec.memOpcode, disp & 0xff);
  }
  ctx.diag(diagnostics, node, `${spec.mnemonic} expects r8/rr/(hl) operand`);
  return undefined;
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
    return encodeIncDec(node, ops[0]!, env, diagnostics, ctx, INC_SPEC);
  }

  if (head === 'dec' && ops.length === 1) {
    return encodeIncDec(node, ops[0]!, env, diagnostics, ctx, DEC_SPEC);
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
