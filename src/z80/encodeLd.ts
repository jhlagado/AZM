import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';

export type LdEncodeContext = {
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
  fitsImm16: (value: number) => boolean;
  memAbs16: (op: AsmOperandNode, env: CompileEnv) => number | undefined;
  memIndexed: (op: AsmOperandNode, env: CompileEnv) => { prefix: number; disp: number } | undefined;
  isMemHL: (op: AsmOperandNode) => boolean;
  isMemRegName: (op: AsmOperandNode, reg: string) => boolean;
  isReg16TransferName: (name: string | undefined) => boolean;
  isLegacyHLReg8: (name: string | undefined) => boolean;
};

export function encodeLdInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ctx: LdEncodeContext,
): Uint8Array | undefined {
  const { diag, regName, immValue, indexedReg8, reg8Code, fitsImm8, fitsImm16 } = ctx;
  const ops = node.operands;
  if (ops.length !== 2) {
    diag(diagnostics, node, `ld expects two operands`);
    return undefined;
  }

  const dst = regName(ops[0]!);
  const src = regName(ops[1]!);
  if (dst === 'I' && src === 'A') return Uint8Array.of(0xed, 0x47);
  if (dst === 'A' && src === 'I') return Uint8Array.of(0xed, 0x57);
  if (dst === 'R' && src === 'A') return Uint8Array.of(0xed, 0x4f);
  if (dst === 'A' && src === 'R') return Uint8Array.of(0xed, 0x5f);

  const r = regName(ops[0]!);
  const n = immValue(ops[1]!, env);
  if (n !== undefined && r) {
    const indexedDst = indexedReg8(ops[0]!);
    if (indexedDst) {
      if (!fitsImm8(n)) {
        diag(diagnostics, node, `ld ${indexedDst.display}, n expects imm8`);
        return undefined;
      }
      return Uint8Array.of(indexedDst.prefix, 0x06 + (indexedDst.code << 3), n & 0xff);
    }
    const r8 = reg8Code(r);
    if (r8 !== undefined) {
      if (!fitsImm8(n)) {
        diag(diagnostics, node, `ld ${r}, n expects imm8`);
        return undefined;
      }
      return Uint8Array.of(0x06 + (r8 << 3), n & 0xff);
    }

    if (r === 'BC' || r === 'DE' || r === 'HL' || r === 'SP') {
      if (!fitsImm16(n)) {
        diag(diagnostics, node, `ld ${r}, nn expects imm16`);
        return undefined;
      }
      const op = r === 'BC' ? 0x01 : r === 'DE' ? 0x11 : r === 'HL' ? 0x21 : 0x31;
      return Uint8Array.of(op, n & 0xff, (n >> 8) & 0xff);
    }
    if (r === 'IX' || r === 'IY') {
      if (!fitsImm16(n)) {
        diag(diagnostics, node, `ld ${r}, nn expects imm16`);
        return undefined;
      }
      const prefix = r === 'IX' ? 0xdd : 0xfd;
      return Uint8Array.of(prefix, 0x21, n & 0xff, (n >> 8) & 0xff);
    }
  }

  const indexedDst = indexedReg8(ops[0]!);
  const indexedSrc = indexedReg8(ops[1]!);
  if ((indexedDst || indexedSrc) && ops[0]!.kind !== 'Mem' && ops[1]!.kind !== 'Mem') {
    const prefix = indexedDst?.prefix ?? indexedSrc?.prefix;
    if (
      (indexedDst && indexedDst.prefix !== prefix) ||
      (indexedSrc && indexedSrc.prefix !== prefix)
    ) {
      diag(diagnostics, node, `ld between IX* and IY* byte registers is not supported`);
      return undefined;
    }
    if (
      (indexedDst && !indexedSrc && ctx.isLegacyHLReg8(src)) ||
      (indexedSrc && !indexedDst && ctx.isLegacyHLReg8(dst))
    ) {
      diag(diagnostics, node, `ld with IX*/IY* does not support legacy H/L counterpart operands`);
      return undefined;
    }
    const d = indexedDst ? indexedDst.code : dst ? reg8Code(dst) : undefined;
    const s = indexedSrc ? indexedSrc.code : src ? reg8Code(src) : undefined;
    if (prefix === undefined || d === undefined || s === undefined) {
      diag(diagnostics, node, `ld with IX*/IY* byte registers expects reg8 operands`);
      return undefined;
    }
    return Uint8Array.of(prefix, 0x40 + (d << 3) + s);
  }

  const srcAbs16 = ctx.memAbs16(ops[1]!, env);
  if (srcAbs16 !== undefined) {
    if (srcAbs16 < 0 || srcAbs16 > 0xffff) {
      diag(diagnostics, node, `ld rr, (nn) expects abs16 address`);
      return undefined;
    }
    if (dst === 'A') return Uint8Array.of(0x3a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
    if (dst === 'HL') return Uint8Array.of(0x2a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
    if (dst === 'BC') return Uint8Array.of(0xed, 0x4b, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
    if (dst === 'DE') return Uint8Array.of(0xed, 0x5b, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
    if (dst === 'SP') return Uint8Array.of(0xed, 0x7b, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
    if (dst === 'IX') return Uint8Array.of(0xdd, 0x2a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
    if (dst === 'IY') return Uint8Array.of(0xfd, 0x2a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
  }

  const dstAbs16 = ctx.memAbs16(ops[0]!, env);
  if (dstAbs16 !== undefined) {
    if (dstAbs16 < 0 || dstAbs16 > 0xffff) {
      diag(diagnostics, node, `ld (nn), rr expects abs16 address`);
      return undefined;
    }
    if (src === 'A') return Uint8Array.of(0x32, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
    if (src === 'HL') return Uint8Array.of(0x22, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
    if (src === 'BC') return Uint8Array.of(0xed, 0x43, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
    if (src === 'DE') return Uint8Array.of(0xed, 0x53, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
    if (src === 'SP') return Uint8Array.of(0xed, 0x73, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
    if (src === 'IX') return Uint8Array.of(0xdd, 0x22, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
    if (src === 'IY') return Uint8Array.of(0xfd, 0x22, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
  }

  if (dst && src) {
    const d = reg8Code(dst);
    const s = reg8Code(src);
    if (d !== undefined && s !== undefined) {
      return Uint8Array.of(0x40 + (d << 3) + s);
    }
  }

  const indexedDstMem = indexedReg8(ops[0]!);
  if (indexedDstMem && ops[1]!.kind === 'Mem') {
    const idx = ctx.memIndexed(ops[1]!, env);
    if (!idx) {
      diag(
        diagnostics,
        node,
        `ld ${indexedDstMem.display}, source expects (${indexedDstMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp)`,
      );
      return undefined;
    }
    if (idx.prefix !== indexedDstMem.prefix) {
      diag(
        diagnostics,
        node,
        `ld ${indexedDstMem.display}, source index base must match destination family`,
      );
      return undefined;
    }
    const disp = idx.disp;
    if (disp < -128 || disp > 127) {
      diag(
        diagnostics,
        node,
        `ld ${indexedDstMem.display}, (${indexedDstMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp) expects disp8`,
      );
      return undefined;
    }
    return Uint8Array.of(indexedDstMem.prefix, 0x46 + (indexedDstMem.code << 3), disp & 0xff);
  }
  if (dst) {
    const d = reg8Code(dst);
    if (d !== undefined && ops[1]!.kind === 'Mem') {
      const mem = ops[1]!;
      if (mem.expr.kind === 'EaName' && mem.expr.name.toUpperCase() === 'HL') {
        return Uint8Array.of(0x46 + (d << 3));
      }
      const idx = ctx.memIndexed(mem, env);
      if (idx) {
        const disp = idx.disp;
        if (disp < -128 || disp > 127) {
          diag(diagnostics, node, `ld ${dst}, (ix/iy+disp) expects disp8`);
          return undefined;
        }
        return Uint8Array.of(idx.prefix, 0x46 + (d << 3), disp & 0xff);
      }
      if (dst.toUpperCase() === 'A' && mem.expr.kind === 'EaName') {
        const ea = mem.expr.name.toUpperCase();
        if (ea === 'BC') return Uint8Array.of(0x0a);
        if (ea === 'DE') return Uint8Array.of(0x1a);
      }
    }
  }

  if (ops[0]!.kind === 'Mem') {
    const mem = ops[0]!;
    const indexedSrcMem = indexedReg8(ops[1]!);
    if (indexedSrcMem) {
      const idx = ctx.memIndexed(mem, env);
      if (!idx) {
        diag(
          diagnostics,
          node,
          `ld destination expects (${indexedSrcMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp) for source ${indexedSrcMem.display}`,
        );
        return undefined;
      }
      if (idx.prefix !== indexedSrcMem.prefix) {
        diag(
          diagnostics,
          node,
          `ld destination index base must match source ${indexedSrcMem.display} family`,
        );
        return undefined;
      }
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(
          diagnostics,
          node,
          `ld (${indexedSrcMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp), ${indexedSrcMem.display} expects disp8`,
        );
        return undefined;
      }
      return Uint8Array.of(idx.prefix, 0x70 + indexedSrcMem.code, disp & 0xff);
    }
    if (mem.expr.kind === 'EaName' && mem.expr.name.toUpperCase() === 'HL' && src) {
      const s = reg8Code(src);
      if (s !== undefined) return Uint8Array.of(0x70 + s);
    }
    const idx = src ? ctx.memIndexed(mem, env) : undefined;
    if (idx && src) {
      const s = reg8Code(src);
      if (s !== undefined) {
        const disp = idx.disp;
        if (disp < -128 || disp > 127) {
          diag(diagnostics, node, `ld (ix/iy+disp), ${src} expects disp8`);
          return undefined;
        }
        return Uint8Array.of(idx.prefix, 0x70 + s, disp & 0xff);
      }
    }
    if (mem.expr.kind === 'EaName' && src?.toUpperCase() === 'A') {
      const ea = mem.expr.name.toUpperCase();
      if (ea === 'BC') return Uint8Array.of(0x02);
      if (ea === 'DE') return Uint8Array.of(0x12);
    }
  }

  if (ctx.isMemHL(ops[0]!) && n !== undefined) {
    if (!fitsImm8(n)) {
      diag(diagnostics, node, `ld (hl), n expects imm8`);
      return undefined;
    }
    return Uint8Array.of(0x36, n & 0xff);
  }
  if (n !== undefined) {
    const idx = ctx.memIndexed(ops[0]!, env);
    if (idx) {
      if (!fitsImm8(n)) {
        diag(diagnostics, node, `ld (ix/iy+disp), n expects imm8`);
        return undefined;
      }
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(diagnostics, node, `ld (ix/iy+disp), n expects disp8`);
        return undefined;
      }
      return Uint8Array.of(idx.prefix, 0x36, disp & 0xff, n & 0xff);
    }
  }

  if (r === 'SP' && src) {
    if (src === 'HL') return Uint8Array.of(0xf9);
    if (src === 'IX') return Uint8Array.of(0xdd, 0xf9);
    if (src === 'IY') return Uint8Array.of(0xfd, 0xf9);
  }

  if (ops[0]!.kind === 'Mem' && ops[1]!.kind === 'Mem') {
    diag(diagnostics, node, `ld does not support memory-to-memory transfers`);
    return undefined;
  }

  if (
    dst !== undefined &&
    dst !== 'A' &&
    (ctx.isMemRegName(ops[1]!, 'BC') || ctx.isMemRegName(ops[1]!, 'DE'))
  ) {
    diag(diagnostics, node, `ld r8, (bc/de) supports destination A only`);
    return undefined;
  }

  if (
    src !== undefined &&
    src !== 'A' &&
    (ctx.isMemRegName(ops[0]!, 'BC') || ctx.isMemRegName(ops[0]!, 'DE'))
  ) {
    diag(diagnostics, node, `ld (bc/de), r8 supports source A only`);
    return undefined;
  }

  if (dst === 'AF' || src === 'AF') {
    diag(diagnostics, node, `ld does not support AF in this form`);
    return undefined;
  }

  if (ctx.isReg16TransferName(dst) && ctx.isReg16TransferName(src)) {
    if (dst === 'SP') {
      diag(diagnostics, node, `ld SP, rr supports HL/IX/IY only`);
      return undefined;
    }
    diag(diagnostics, node, `ld rr, rr supports SP <- HL/IX/IY only`);
    return undefined;
  }

  diag(diagnostics, node, `ld expects a supported register/memory/immediate transfer form`);
  return undefined;
}
