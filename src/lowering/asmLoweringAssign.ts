import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';

type DiagAt = (diagnostics: Diagnostic[], span: AsmInstructionNode['span'], message: string) => void;

export type AssignLoweringContext = {
  diagnostics: Diagnostic[];
  diagAt: DiagAt;
  emitInstr: (head: string, operands: AsmOperandNode[], span: AsmInstructionNode['span']) => boolean;
  lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
  pushEaAddress: (ea: EaExprNode, span: AsmInstructionNode['span']) => boolean;
  reg16: Set<string>;
  emitAssignmentImmediateToRegister: (
    dst: Extract<AsmOperandNode, { kind: 'Reg' }>,
    src: Extract<AsmOperandNode, { kind: 'Imm' }>,
    span: AsmInstructionNode['span'],
  ) => boolean;
  emitAssignmentRegisterTransfer: (
    dst: Extract<AsmOperandNode, { kind: 'Reg' }>,
    src: Extract<AsmOperandNode, { kind: 'Reg' }>,
    span: AsmInstructionNode['span'],
  ) => boolean;
  syncToFlow: () => void;
};

export function tryLowerAssignmentInstruction(
  asmItem: AsmInstructionNode,
  ctx: AssignLoweringContext,
): boolean | undefined {
  const head = asmItem.head.toLowerCase();
  if (head !== ':=') return undefined;

  const dst = asmItem.operands[0];
  const src = asmItem.operands[1];
  if (!dst || !src || asmItem.operands.length !== 2) {
    ctx.diagAt(ctx.diagnostics, asmItem.span, `":=" expects exactly two operands.`);
    return true;
  }
  if (src.kind === 'Ea' && src.explicitAddressOf) {
    if (dst.kind === 'Ea') {
      if (ctx.lowerLdWithEa(asmItem)) {
        ctx.syncToFlow();
        return true;
      }
      ctx.diagAt(ctx.diagnostics, asmItem.span, `":=" form is not supported.`);
      return true;
    }
    if (dst.kind !== 'Reg' || !ctx.reg16.has(dst.name.toUpperCase())) {
      ctx.diagAt(
        ctx.diagnostics,
        asmItem.span,
        `":=" address-of source requires a 16-bit register destination.`,
      );
      return true;
    }
    if (!ctx.pushEaAddress(src.expr, asmItem.span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span: asmItem.span, name: dst.name.toUpperCase() }], asmItem.span))
      return false;
    ctx.syncToFlow();
    return true;
  }
  if (dst.kind === 'Ea' || src.kind === 'Ea') {
    if (ctx.lowerLdWithEa(asmItem)) {
      ctx.syncToFlow();
      return true;
    }
    ctx.diagAt(ctx.diagnostics, asmItem.span, `":=" form is not supported.`);
    return true;
  }
  if (dst.kind === 'Reg' && src.kind === 'Imm') {
    if (ctx.emitAssignmentImmediateToRegister(dst, src, asmItem.span)) {
      ctx.syncToFlow();
      return true;
    }
    ctx.diagAt(ctx.diagnostics, asmItem.span, `":=" form is not supported.`);
    return true;
  }
  if (dst.kind === 'Reg' && src.kind === 'Reg') {
    if (ctx.emitAssignmentRegisterTransfer(dst, src, asmItem.span)) {
      ctx.syncToFlow();
      return true;
    }
    ctx.diagAt(ctx.diagnostics, asmItem.span, `":=" form is not supported.`);
    return true;
  }
  ctx.diagAt(ctx.diagnostics, asmItem.span, `":=" form is not supported.`);
  return true;
}
