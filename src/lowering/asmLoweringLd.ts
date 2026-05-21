import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import {
  diagLayoutCastRuntimeIndex,
  isConstantLayoutCastEa,
} from '../semantics/layoutCastFold.js';

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
  resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
  emitAbs16LdFixup: (
    dst: AsmOperandNode,
    src: AsmOperandNode,
    span: AsmInstructionNode['span'],
  ) => boolean;
  isUnresolvedLayoutLdOperand: (op: AsmOperandNode) => boolean;
  resolveRawLabelName: (name: string) => string;
  isRegisterLikeMemEa: (ea: EaExprNode) => boolean;
  syncToFlow: () => void;
};

function eaOperandExpr(op: AsmOperandNode): EaExprNode | undefined {
  if (op.kind === 'Ea') return op.expr;
  if (op.kind === 'Mem') return op.expr;
  return undefined;
}

function ldImmediateOpcode(dst: string | undefined): number | undefined {
  switch (dst) {
    case 'BC':
      return 0x01;
    case 'DE':
      return 0x11;
    case 'HL':
      return 0x21;
    case 'SP':
      return 0x31;
    default:
      return undefined;
  }
}

function tryEmitUnresolvedImmNameLd(
  asmItem: AsmInstructionNode,
  ctx: LdLoweringContext,
  dst: string | undefined,
  srcOp: AsmOperandNode,
): boolean {
  if (srcOp.kind !== 'Imm' || srcOp.expr.kind !== 'ImmName') return false;
  if (ctx.evalImmExpr(srcOp.expr) !== undefined) return false;

  const baseLower = ctx.resolveRawLabelName(srcOp.expr.name).toLowerCase();
  const opcode = ldImmediateOpcode(dst);
  if (opcode !== undefined) {
    ctx.emitAbs16Fixup(opcode, baseLower, 0, asmItem.span);
    return true;
  }
  if (dst === 'IX' || dst === 'IY') {
    ctx.emitAbs16FixupPrefixed(dst === 'IX' ? 0xdd : 0xfd, 0x21, baseLower, 0, asmItem.span);
    return true;
  }
  return false;
}

/** Emit ordinary abs16 fixups for folded layout-cast address expressions. */
function tryLdFoldedLayoutCast(
  asmItem: AsmInstructionNode,
  ctx: LdLoweringContext,
): boolean {
  if (asmItem.operands.length !== 2) return false;
  const dstOp = asmItem.operands[0]!;
  const srcOp = asmItem.operands[1]!;
  const span = asmItem.span;

  const emitFromAbs = (
    opcode: number,
    resolved: EaResolution,
    prefixed?: { prefix: number; opcode2: number },
  ): void => {
    if (resolved.kind !== 'abs') return;
    if (prefixed) {
      ctx.emitAbs16FixupPrefixed(
        prefixed.prefix,
        prefixed.opcode2,
        resolved.baseLower,
        resolved.addend,
        span,
      );
    } else {
      ctx.emitAbs16Fixup(opcode, resolved.baseLower, resolved.addend, span);
    }
  };

  const dstName = dstOp.kind === 'Reg' ? dstOp.name.toUpperCase() : undefined;
  const srcEa = eaOperandExpr(srcOp);
  const dstEa = eaOperandExpr(dstOp);

  if (srcEa && isConstantLayoutCastEa(srcEa)) {
    const resolved = ctx.resolveEa(srcEa, span);
    if (resolved?.kind === 'abs') {
      if (dstName === 'A' && srcOp.kind === 'Mem') {
        emitFromAbs(0x3a, resolved);
        return true;
      }
      if (dstName === 'HL') {
        emitFromAbs(0x21, resolved);
        return true;
      }
      if (dstName === 'DE') {
        emitFromAbs(0x11, resolved);
        return true;
      }
      if (dstName === 'BC') {
        emitFromAbs(0x01, resolved);
        return true;
      }
      if (dstName === 'SP') {
        emitFromAbs(0x31, resolved);
        return true;
      }
      if (dstName === 'IX') {
        emitFromAbs(0x21, resolved, { prefix: 0xdd, opcode2: 0x21 });
        return true;
      }
      if (dstName === 'IY') {
        emitFromAbs(0x21, resolved, { prefix: 0xfd, opcode2: 0x21 });
        return true;
      }
    }
  }

  if (dstEa && isConstantLayoutCastEa(dstEa)) {
    const resolved = ctx.resolveEa(dstEa, span);
    if (resolved?.kind === 'abs' && srcOp.kind === 'Reg' && srcOp.name.toUpperCase() === 'A') {
      emitFromAbs(0x32, resolved);
      return true;
    }
  }

  return false;
}

export function tryLowerLdInstruction(asmItem: AsmInstructionNode, ctx: LdLoweringContext): boolean | undefined {
  const head = asmItem.head.toLowerCase();
  if (head !== 'ld') return undefined;

  for (const op of asmItem.operands) {
    const ea = eaOperandExpr(op);
    if (ea && diagLayoutCastRuntimeIndex(ctx.diagnostics, asmItem.span, ea)) {
      ctx.syncToFlow();
      return true;
    }
  }

  if (asmItem.operands.length === 2) {
    const dstOp = asmItem.operands[0]!;
    const srcOp = asmItem.operands[1]!;
    const dst = dstOp.kind === 'Reg' ? dstOp.name.toUpperCase() : undefined;
    if (tryEmitUnresolvedImmNameLd(asmItem, ctx, dst, srcOp)) {
      ctx.syncToFlow();
      return true;
    }
    if (ctx.emitAbs16LdFixup(dstOp, srcOp, asmItem.span)) {
      ctx.syncToFlow();
      return true;
    }
    if (tryLdFoldedLayoutCast(asmItem, ctx)) {
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

  if (asmItem.operands.some(ctx.isUnresolvedLayoutLdOperand)) {
    ctx.diagAt(
      ctx.diagnostics,
      asmItem.span,
      `"ld" does not accept unresolved layout operands; use explicit labels, directives, and constant layout expressions.`,
    );
    return true;
  }

  return undefined;
}
