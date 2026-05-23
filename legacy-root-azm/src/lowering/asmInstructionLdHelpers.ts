import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';
import { isConstantLayoutCastEa } from '../semantics/layoutCastFold.js';

export type LdHelperContext = {
  emitInstr: (
    head: string,
    operands: AsmOperandNode[],
    span: AsmInstructionNode['span'],
  ) => boolean;
  emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: AsmInstructionNode['span'],
    asmText?: string,
  ) => void;
  emitAbs16FixupPrefixed: (
    prefix: number,
    opcode2: number,
    baseLower: string,
    addend: number,
    span: AsmInstructionNode['span'],
    asmText?: string,
  ) => void;
  emitVirtualReg16Transfer: (asmItem: AsmInstructionNode) => boolean;
  resolveRawAliasTargetName: (name: string) => string | undefined;
  reg16: Set<string>;
};

export function createAsmInstructionLdHelpers(ctx: LdHelperContext) {
  const isUnresolvedLayoutLdOperand = (op: AsmOperandNode): boolean => {
    if (op.kind === 'Ea') {
      if (isConstantLayoutCastEa(op.expr)) return false;
      return true;
    }
    return false;
  };

  const resolveRawLabelName = (name: string): string => ctx.resolveRawAliasTargetName(name) ?? name;

  const emitAbs16LdFixup = (
    dst: AsmOperandNode,
    src: AsmOperandNode,
    span: AsmInstructionNode['span'],
  ): boolean => {
    const dstName = dst.kind === 'Reg' ? dst.name.toUpperCase() : undefined;
    const srcName = src.kind === 'Reg' ? src.name.toUpperCase() : undefined;
    const memExpr = dst.kind === 'Mem' ? dst.expr : src.kind === 'Mem' ? src.expr : undefined;
    if (!memExpr || memExpr.kind !== 'EaName') return false;
    // Register-indirect `(hl)`, `(bc)`, `(de)`, `(ix)`, `(iy)` use `EaName`; these are not
    // the absolute-address `ld r/(nn)` forms handled below (see `isRegisterLikeMemEa`).
    // Labels that spell HL/BC/DE/IX/IY cannot use `(name)` for absolute memory here; `(hl)` is always HL indirect.
    if (ctx.reg16.has(memExpr.name.toUpperCase())) return false;
    const baseLower = resolveRawLabelName(memExpr.name).toLowerCase();

    if (dst.kind === 'Reg' && src.kind === 'Mem') {
      if (dstName === 'A') {
        ctx.emitAbs16Fixup(0x3a, baseLower, 0, span);
        return true;
      }
      if (dstName === 'HL') {
        ctx.emitAbs16Fixup(0x2a, baseLower, 0, span);
        return true;
      }
      if (dstName === 'BC') {
        ctx.emitAbs16FixupPrefixed(0xed, 0x4b, baseLower, 0, span);
        return true;
      }
      if (dstName === 'DE') {
        ctx.emitAbs16FixupPrefixed(0xed, 0x5b, baseLower, 0, span);
        return true;
      }
      if (dstName === 'SP') {
        ctx.emitAbs16FixupPrefixed(0xed, 0x7b, baseLower, 0, span);
        return true;
      }
      if (dstName === 'IX') {
        ctx.emitAbs16FixupPrefixed(0xdd, 0x2a, baseLower, 0, span);
        return true;
      }
      if (dstName === 'IY') {
        ctx.emitAbs16FixupPrefixed(0xfd, 0x2a, baseLower, 0, span);
        return true;
      }
    }

    if (dst.kind === 'Mem' && src.kind === 'Reg') {
      if (srcName === 'A') {
        ctx.emitAbs16Fixup(0x32, baseLower, 0, span);
        return true;
      }
      if (srcName === 'HL') {
        ctx.emitAbs16Fixup(0x22, baseLower, 0, span);
        return true;
      }
      if (srcName === 'BC') {
        ctx.emitAbs16FixupPrefixed(0xed, 0x43, baseLower, 0, span);
        return true;
      }
      if (srcName === 'DE') {
        ctx.emitAbs16FixupPrefixed(0xed, 0x53, baseLower, 0, span);
        return true;
      }
      if (srcName === 'SP') {
        ctx.emitAbs16FixupPrefixed(0xed, 0x73, baseLower, 0, span);
        return true;
      }
      if (srcName === 'IX') {
        ctx.emitAbs16FixupPrefixed(0xdd, 0x22, baseLower, 0, span);
        return true;
      }
      if (srcName === 'IY') {
        ctx.emitAbs16FixupPrefixed(0xfd, 0x22, baseLower, 0, span);
        return true;
      }
    }

    return false;
  };

  const isRegisterLikeMemEa = (ea: EaExprNode): boolean => {
    if (ea.kind === 'EaName') {
      return ctx.reg16.has(ea.name.toUpperCase());
    }
    if ((ea.kind === 'EaAdd' || ea.kind === 'EaSub') && ea.base.kind === 'EaName') {
      const base = ea.base.name.toUpperCase();
      return base === 'IX' || base === 'IY';
    }
    return false;
  };

  return {
    isUnresolvedLayoutLdOperand,
    resolveRawLabelName,
    emitAbs16LdFixup,
    isRegisterLikeMemEa,
  };
}
