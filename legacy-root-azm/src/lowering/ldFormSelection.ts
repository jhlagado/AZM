import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';
import type { SourceSpan } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EaResolution } from './eaResolution.js';

export type LdForm = {
  inst: AsmInstructionNode;
  dst: AsmOperandNode;
  src: AsmOperandNode;
  dstResolved: EaResolution | undefined;
  srcResolved: EaResolution | undefined;
  srcHasRegisterLikeEaBase: boolean;
  dstHasRegisterLikeEaBase: boolean;
  srcIsIxIyDispMem: boolean;
  dstIsIxIyDispMem: boolean;
  srcIsEaNameHL: boolean;
  dstIsEaNameHL: boolean;
  srcIsEaNameBCorDE: boolean;
  dstIsEaNameBCorDE: boolean;
};

export type LdFormSelectionContext = {
  env: CompileEnv;
  resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
};

export function createLdFormSelectionHelpers(ctx: LdFormSelectionContext) {
  const { env, resolveEa } = ctx;

  const coerceValueOperand = (op: AsmOperandNode): AsmOperandNode => {
    if (op.kind === 'Reg') {
      const lower = op.name.toLowerCase();
      if (env.equates.has(lower)) {
        return {
          kind: 'Mem',
          span: op.span,
          expr: { kind: 'EaName', span: op.span, name: op.name },
        };
      }
    }
    return op;
  };

  const isRegisterToken = (name: string): boolean => {
    const token = name.toUpperCase();
    return (
      token === 'A' ||
      token === 'B' ||
      token === 'C' ||
      token === 'D' ||
      token === 'E' ||
      token === 'H' ||
      token === 'L' ||
      token === 'AF' ||
      token === 'BC' ||
      token === 'DE' ||
      token === 'HL' ||
      token === 'SP' ||
      token === 'IX' ||
      token === 'IY' ||
      token === 'IXH' ||
      token === 'IXL' ||
      token === 'IYH' ||
      token === 'IYL'
    );
  };

  const isBoundEaName = (name: string): boolean => {
    const lower = name.toLowerCase();
    return env.equates.has(lower);
  };

  const hasRegisterLikeEaBase = (ea: EaExprNode): boolean => {
    switch (ea.kind) {
      case 'EaName':
        return isRegisterToken(ea.name) && !isBoundEaName(ea.name);
      case 'EaImm':
        return false;
      case 'EaLayoutCast':
        return false;
      case 'EaField':
        return hasRegisterLikeEaBase(ea.base);
      case 'EaIndex':
        return hasRegisterLikeEaBase(ea.base);
      case 'EaAdd':
      case 'EaSub':
        return hasRegisterLikeEaBase(ea.base);
    }
  };

  const isEaNameHL = (ea: EaExprNode): boolean =>
    ea.kind === 'EaName' && ea.name.toUpperCase() === 'HL';

  const isEaNameBCorDE = (ea: EaExprNode): boolean =>
    ea.kind === 'EaName' && (ea.name.toUpperCase() === 'BC' || ea.name.toUpperCase() === 'DE');

  const isIxIyBaseEa = (ea: EaExprNode): boolean =>
    ea.kind === 'EaName' && (ea.name.toUpperCase() === 'IX' || ea.name.toUpperCase() === 'IY');

  const isIxIyDispMem = (op: AsmOperandNode): boolean =>
    op.kind === 'Mem' &&
    (isIxIyBaseEa(op.expr) ||
      (op.expr.kind === 'EaIndex' &&
        isIxIyBaseEa(op.expr.base) &&
        op.expr.index.kind === 'IndexImm') ||
      ((op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') && isIxIyBaseEa(op.expr.base)));

  const analyzeLdInstruction = (inst: AsmInstructionNode): LdForm | null => {
    const head = inst.head.toLowerCase();
    if (head !== 'ld' || inst.operands.length !== 2) return null;

    const dst = coerceValueOperand(inst.operands[0]!);
    const src = coerceValueOperand(inst.operands[1]!);
    const dstResolved = dst.kind === 'Mem' ? resolveEa(dst.expr, inst.span) : undefined;
    const srcResolved = src.kind === 'Mem' ? resolveEa(src.expr, inst.span) : undefined;

    return {
      inst,
      dst,
      src,
      dstResolved,
      srcResolved,
      srcHasRegisterLikeEaBase: src.kind === 'Mem' ? hasRegisterLikeEaBase(src.expr) : false,
      dstHasRegisterLikeEaBase: dst.kind === 'Mem' ? hasRegisterLikeEaBase(dst.expr) : false,
      srcIsIxIyDispMem: isIxIyDispMem(src),
      dstIsIxIyDispMem: isIxIyDispMem(dst),
      srcIsEaNameHL: src.kind === 'Mem' ? isEaNameHL(src.expr) : false,
      dstIsEaNameHL: dst.kind === 'Mem' ? isEaNameHL(dst.expr) : false,
      srcIsEaNameBCorDE: src.kind === 'Mem' ? isEaNameBCorDE(src.expr) : false,
      dstIsEaNameBCorDE: dst.kind === 'Mem' ? isEaNameBCorDE(dst.expr) : false,
    };
  };

  return { analyzeLdInstruction };
}
