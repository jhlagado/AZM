import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';

type DiagAt = (diagnostics: Diagnostic[], span: AsmInstructionNode['span'], message: string) => void;

export type LdLoweringContext = {
  diagnostics: Diagnostic[];
  diagAt: DiagAt;
  emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: AsmInstructionNode['span'],
  ) => void;
  emitAbs16FixupPrefixed: (
    prefix: number,
    opcode2: number,
    baseLower: string,
    addend: number,
    span: AsmInstructionNode['span'],
  ) => void;
  evalImmExpr: (expr: Extract<AsmOperandNode, { kind: 'Imm' }>['expr']) => number | undefined;
  resolveScalarBinding: (name: string) => 'byte' | 'word' | 'addr' | undefined;
  lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
  emitAbs16LdFixup: (
    dst: AsmOperandNode,
    src: AsmOperandNode,
    span: AsmInstructionNode['span'],
  ) => boolean;
  isTypedStorageLdOperand: (op: AsmOperandNode) => boolean;
  isRawLdLabelName: (name: string) => boolean;
  resolveRawLabelName: (name: string) => string;
  isRegisterLikeMemEa: (ea: EaExprNode) => boolean;
  syncToFlow: () => void;
};

export function tryLowerLdInstruction(asmItem: AsmInstructionNode, ctx: LdLoweringContext): boolean | undefined {
  const head = asmItem.head.toLowerCase();
  if (head !== 'ld') return undefined;

  if (asmItem.operands.length === 2) {
    const dstOp = asmItem.operands[0]!;
    const srcOp = asmItem.operands[1]!;
    const dst = dstOp.kind === 'Reg' ? dstOp.name.toUpperCase() : undefined;
    const opcode =
      dst === 'BC'
        ? 0x01
        : dst === 'DE'
          ? 0x11
          : dst === 'HL'
            ? 0x21
            : dst === 'SP'
              ? 0x31
              : undefined;
    if (
      opcode !== undefined &&
      srcOp.kind === 'Imm' &&
      srcOp.expr.kind === 'ImmName' &&
      (!ctx.resolveScalarBinding(srcOp.expr.name) || ctx.isRawLdLabelName(srcOp.expr.name))
    ) {
      const v = ctx.evalImmExpr(srcOp.expr);
      if (v === undefined) {
        const baseLower = ctx.resolveRawLabelName(srcOp.expr.name).toLowerCase();
        ctx.emitAbs16Fixup(opcode, baseLower, 0, asmItem.span);
        ctx.syncToFlow();
        return true;
      }
    }
    if (
      (dst === 'IX' || dst === 'IY') &&
      srcOp.kind === 'Imm' &&
      srcOp.expr.kind === 'ImmName' &&
      (!ctx.resolveScalarBinding(srcOp.expr.name) || ctx.isRawLdLabelName(srcOp.expr.name))
    ) {
      const v = ctx.evalImmExpr(srcOp.expr);
      if (v === undefined) {
        const baseLower = ctx.resolveRawLabelName(srcOp.expr.name).toLowerCase();
        ctx.emitAbs16FixupPrefixed(dst === 'IX' ? 0xdd : 0xfd, 0x21, baseLower, 0, asmItem.span);
        ctx.syncToFlow();
        return true;
      }
    }
    if (ctx.emitAbs16LdFixup(dstOp, srcOp, asmItem.span)) {
      ctx.syncToFlow();
      return true;
    }
  }

  if (
    asmItem.operands.some(
      (op) => op.kind === 'Mem' && op.expr.kind !== 'EaImm' && !ctx.isRegisterLikeMemEa(op.expr),
    )
  ) {
    if (ctx.lowerLdWithEa(asmItem)) {
      ctx.syncToFlow();
      return true;
    }
  }

  if (asmItem.operands.some(ctx.isTypedStorageLdOperand)) {
    const allowed = asmItem.operands.every((op) => {
      if (op.kind === 'Ea') {
        return op.expr.kind === 'EaName' && ctx.isRawLdLabelName(op.expr.name);
      }
      if (op.kind === 'Imm' && op.expr.kind === 'ImmName') {
        return ctx.isRawLdLabelName(op.expr.name);
      }
      return op.kind !== 'Reg' || !ctx.resolveScalarBinding(op.name);
    });
    if (!allowed) {
      ctx.diagAt(
        ctx.diagnostics,
        asmItem.span,
        `"ld" no longer accepts typed storage operands; use ":=".`,
      );
      return true;
    }
  }

  return undefined;
}
