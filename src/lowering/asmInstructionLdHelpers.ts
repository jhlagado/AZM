import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';

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
  resolveScalarBinding: (name: string) => 'byte' | 'word' | 'addr' | undefined;
  resolveRawAliasTargetName: (name: string) => string | undefined;
  isModuleStorageName: (name: string) => boolean;
  isFrameSlotName: (name: string) => boolean;
  reg16: Set<string>;
};

export function createAsmInstructionLdHelpers(ctx: LdHelperContext) {
  const emitAssignmentImmediateToRegister = (
    dst: Extract<AsmOperandNode, { kind: 'Reg' }>,
    src: Extract<AsmOperandNode, { kind: 'Imm' }>,
    span: AsmInstructionNode['span'],
  ): boolean => {
    const dstName = dst.name.toUpperCase();
    if (
      dstName === 'A' ||
      dstName === 'B' ||
      dstName === 'C' ||
      dstName === 'D' ||
      dstName === 'E' ||
      dstName === 'H' ||
      dstName === 'L' ||
      dstName === 'IXH' ||
      dstName === 'IXL' ||
      dstName === 'IYH' ||
      dstName === 'IYL' ||
      dstName === 'BC' ||
      dstName === 'DE' ||
      dstName === 'HL' ||
      dstName === 'IX' ||
      dstName === 'IY'
    ) {
      return ctx.emitInstr('ld', [{ ...dst, name: dstName }, src], span);
    }
    return false;
  };

  const emitZeroExtendReg8ToReg16 = (
    dstName: 'BC' | 'DE' | 'HL',
    srcName: string,
    span: AsmInstructionNode['span'],
  ): boolean => {
    const hi = dstName === 'BC' ? 'B' : dstName === 'DE' ? 'D' : 'H';
    const lo = dstName === 'BC' ? 'C' : dstName === 'DE' ? 'E' : 'L';
    return (
      ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: hi },
          { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
        ],
        span,
      ) &&
      ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: lo },
          { kind: 'Reg', span, name: srcName },
        ],
        span,
      )
    );
  };

  const emitAssignmentRegisterTransfer = (
    dst: Extract<AsmOperandNode, { kind: 'Reg' }>,
    src: Extract<AsmOperandNode, { kind: 'Reg' }>,
    span: AsmInstructionNode['span'],
  ): boolean => {
    const dstName = dst.name.toUpperCase();
    const srcName = src.name.toUpperCase();
    const halfIndexRegs = new Set(['IXH', 'IXL', 'IYH', 'IYL']);
    if (dstName === srcName) return true;
    if (dstName === 'A' && srcName === 'A') return true;
    if (dstName === 'A') return false;
    if (halfIndexRegs.has(dstName) || halfIndexRegs.has(srcName)) {
      return ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: dstName },
          { kind: 'Reg', span, name: srcName },
        ],
        span,
      );
    }
    const wideRegs = new Set(['BC', 'DE', 'HL', 'IX', 'IY']);
    if (dstName === 'BC' || dstName === 'DE' || dstName === 'HL') {
      if (srcName === 'A') return emitZeroExtendReg8ToReg16(dstName, srcName, span);
      const asLd: AsmInstructionNode = {
        kind: 'AsmInstruction',
        span,
        head: 'ld',
        operands: [
          { kind: 'Reg', span, name: dstName },
          { kind: 'Reg', span, name: srcName },
        ],
      };
      return ctx.emitVirtualReg16Transfer(asLd);
    }
    if (dstName === 'IX' || dstName === 'IY') {
      if (!wideRegs.has(srcName)) return false;
      return (
        ctx.emitInstr('push', [{ kind: 'Reg', span, name: srcName }], span) &&
        ctx.emitInstr('pop', [{ kind: 'Reg', span, name: dstName }], span)
      );
    }
    return false;
  };

  const isTypedStorageLdOperand = (op: AsmOperandNode): boolean => {
    if (op.kind === 'Ea') return true;
    if (op.kind === 'Imm' && op.expr.kind === 'ImmName') {
      return ctx.resolveScalarBinding(op.expr.name) !== undefined;
    }
    if (op.kind === 'Reg') {
      return ctx.resolveScalarBinding(op.name) !== undefined;
    }
    return false;
  };

  const resolveRawLabelName = (name: string): string => ctx.resolveRawAliasTargetName(name) ?? name;

  const isRawLdLabelName = (name: string): boolean => {
    const resolved = resolveRawLabelName(name);
    return ctx.isModuleStorageName(resolved) && !ctx.isFrameSlotName(resolved);
  };

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
    // Storage labels that spell HL/BC/DE/IX/IY cannot use `(name)` for absolute mem here—`(hl)` is always HL indirect.
    if (ctx.reg16.has(memExpr.name.toUpperCase())) return false;
    const baseLower = resolveRawLabelName(memExpr.name).toLowerCase();
    if (ctx.isFrameSlotName(baseLower)) return false;

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
    emitAssignmentImmediateToRegister,
    emitAssignmentRegisterTransfer,
    isTypedStorageLdOperand,
    resolveRawLabelName,
    isRawLdLabelName,
    emitAbs16LdFixup,
    isRegisterLikeMemEa,
  };
}
