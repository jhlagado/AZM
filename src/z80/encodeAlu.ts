import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';

export type AluEncodeContext = {
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
  fitsImm8: (value: number) => boolean;
  isMemHL: (op: AsmOperandNode) => boolean;
  memIndexed: (op: AsmOperandNode, env: CompileEnv) => { prefix: number; disp: number } | undefined;
};

function encodeAluAOrImm8OrMemHL(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: AluEncodeContext,
  rBase: number,
  immOpcode: number,
  memOpcode: number,
  mnemonic: string,
  allowExplicitA = false,
): Uint8Array | undefined {
  const ops = node.operands;

  let src: AsmOperandNode | undefined;
  if (ops.length === 1) src = ops[0]!;
  else if (ops.length === 2) {
    if (allowExplicitA) {
      if (ctx.regName(ops[0]!) === 'A') src = ops[1]!;
      else {
        ctx.diag(diagnostics, node, `${mnemonic} two-operand form requires destination A`);
        return undefined;
      }
    }
  }
  if (!src) return undefined;

  const reg = ctx.regName(src);
  const indexed = ctx.indexedReg8(src);
  if (indexed) return Uint8Array.of(indexed.prefix, rBase + indexed.code);
  if (reg) {
    const code = ctx.reg8Code(reg);
    if (code === undefined) {
      ctx.diag(diagnostics, node, `${mnemonic} expects reg8/imm8/(hl)`);
      return undefined;
    }
    return Uint8Array.of(rBase + code);
  }

  if (ctx.isMemHL(src)) return Uint8Array.of(memOpcode);
  const idx = ctx.memIndexed(src, env);
  if (idx) {
    const disp = idx.disp;
    if (disp < -128 || disp > 127) {
      ctx.diag(diagnostics, node, `${mnemonic} (ix/iy+disp) expects disp8`);
      return undefined;
    }
    return Uint8Array.of(idx.prefix, memOpcode, disp & 0xff);
  }

  const n = ctx.immValue(src, env);
  if (n === undefined || !ctx.fitsImm8(n)) {
    ctx.diag(diagnostics, node, `${mnemonic} expects imm8`);
    return undefined;
  }
  return Uint8Array.of(immOpcode, n & 0xff);
}

export function encodeAluInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: AluEncodeContext,
): Uint8Array | undefined {
  const head = node.head.toLowerCase();
  const ops = node.operands;

  if (head === 'add' && ops.length === 2) {
    const dst = ctx.regName(ops[0]!);
    const src = ctx.regName(ops[1]!);

    if (dst === 'A') {
      const indexedSrc = ctx.indexedReg8(ops[1]!);
      if (indexedSrc) return Uint8Array.of(indexedSrc.prefix, 0x80 + indexedSrc.code);
      if (src) {
        const s = ctx.reg8Code(src);
        if (s !== undefined) return Uint8Array.of(0x80 + s);
      }
      if (ctx.isMemHL(ops[1]!)) return Uint8Array.of(0x86);
      const idx = ctx.memIndexed(ops[1]!, env);
      if (idx) {
        const disp = idx.disp;
        if (disp < -128 || disp > 127) {
          ctx.diag(diagnostics, node, `add A, (ix/iy+disp) expects disp8`);
          return undefined;
        }
        return Uint8Array.of(idx.prefix, 0x86, disp & 0xff);
      }
      const n = ctx.immValue(ops[1]!, env);
      if (n !== undefined) {
        if (!ctx.fitsImm8(n)) {
          ctx.diag(diagnostics, node, `add A, n expects imm8`);
          return undefined;
        }
        return Uint8Array.of(0xc6, n & 0xff);
      }
      ctx.diag(diagnostics, node, `add A, src expects reg8/imm8/(hl)/(ix/iy+disp)`);
      return undefined;
    }

    if (dst === 'HL' && src) {
      switch (src) {
        case 'BC':
          return Uint8Array.of(0x09);
        case 'DE':
          return Uint8Array.of(0x19);
        case 'HL':
          return Uint8Array.of(0x29);
        case 'SP':
          return Uint8Array.of(0x39);
      }
      ctx.diag(diagnostics, node, `add HL, rr expects BC/DE/HL/SP`);
      return undefined;
    }
    if (dst === 'HL') {
      ctx.diag(diagnostics, node, `add HL, rr expects BC/DE/HL/SP`);
      return undefined;
    }

    if ((dst === 'IX' || dst === 'IY') && src) {
      const prefix = dst === 'IX' ? 0xdd : 0xfd;
      switch (src) {
        case 'BC':
          return Uint8Array.of(prefix, 0x09);
        case 'DE':
          return Uint8Array.of(prefix, 0x19);
        case 'SP':
          return Uint8Array.of(prefix, 0x39);
        case 'IX':
          if (dst === 'IX') return Uint8Array.of(0xdd, 0x29);
          break;
        case 'IY':
          if (dst === 'IY') return Uint8Array.of(0xfd, 0x29);
          break;
      }
      ctx.diag(diagnostics, node, `add ${dst}, rr supports BC/DE/SP and same-index pair only`);
      return undefined;
    }
    if (dst === 'IX' || dst === 'IY') {
      ctx.diag(diagnostics, node, `add ${dst}, rr supports BC/DE/SP and same-index pair only`);
      return undefined;
    }

    ctx.diag(diagnostics, node, `add expects destination A, HL, IX, or IY`);
    return undefined;
  }

  if (head === 'sub') {
    const encoded = encodeAluAOrImm8OrMemHL(
      node,
      env,
      diagnostics,
      ctx,
      0x90,
      0xd6,
      0x96,
      'sub',
      true,
    );
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'cp') {
    const encoded = encodeAluAOrImm8OrMemHL(
      node,
      env,
      diagnostics,
      ctx,
      0xb8,
      0xfe,
      0xbe,
      'cp',
      true,
    );
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'and') {
    const encoded = encodeAluAOrImm8OrMemHL(
      node,
      env,
      diagnostics,
      ctx,
      0xa0,
      0xe6,
      0xa6,
      'and',
      true,
    );
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'or') {
    const encoded = encodeAluAOrImm8OrMemHL(
      node,
      env,
      diagnostics,
      ctx,
      0xb0,
      0xf6,
      0xb6,
      'or',
      true,
    );
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'xor') {
    const encoded = encodeAluAOrImm8OrMemHL(
      node,
      env,
      diagnostics,
      ctx,
      0xa8,
      0xee,
      0xae,
      'xor',
      true,
    );
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'adc') {
    if (ops.length === 2) {
      const dst = ctx.regName(ops[0]!);
      if (dst === 'HL') {
        const src = ctx.regName(ops[1]!);
        switch (src) {
          case 'BC':
            return Uint8Array.of(0xed, 0x4a);
          case 'DE':
            return Uint8Array.of(0xed, 0x5a);
          case 'HL':
            return Uint8Array.of(0xed, 0x6a);
          case 'SP':
            return Uint8Array.of(0xed, 0x7a);
          default:
            ctx.diag(diagnostics, node, `adc HL, rr expects BC/DE/HL/SP`);
            return undefined;
        }
      }
      if (dst !== 'A') {
        ctx.diag(diagnostics, node, `adc expects destination A or HL`);
        return undefined;
      }
    }
    const encoded = encodeAluAOrImm8OrMemHL(
      node,
      env,
      diagnostics,
      ctx,
      0x88,
      0xce,
      0x8e,
      'adc',
      true,
    );
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'sbc') {
    if (ops.length === 2) {
      const dst = ctx.regName(ops[0]!);
      if (dst === 'HL') {
        const src = ctx.regName(ops[1]!);
        switch (src) {
          case 'BC':
            return Uint8Array.of(0xed, 0x42);
          case 'DE':
            return Uint8Array.of(0xed, 0x52);
          case 'HL':
            return Uint8Array.of(0xed, 0x62);
          case 'SP':
            return Uint8Array.of(0xed, 0x72);
          default:
            ctx.diag(diagnostics, node, `sbc HL, rr expects BC/DE/HL/SP`);
            return undefined;
        }
      }
      if (dst !== 'A') {
        ctx.diag(diagnostics, node, `sbc expects destination A or HL`);
        return undefined;
      }
    }
    const encoded = encodeAluAOrImm8OrMemHL(
      node,
      env,
      diagnostics,
      ctx,
      0x98,
      0xde,
      0x9e,
      'sbc',
      true,
    );
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  return undefined;
}
