import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, EaExprNode } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { ScalarKind } from './typeResolution.js';

type DiagAt = (diagnostics: Diagnostic[], span: AsmInstructionNode['span'], message: string) => void;

export type StepLoweringContext = {
  diagnostics: Diagnostic[];
  diagAt: DiagAt;
  emitInstr: (head: string, operands: AsmOperandNode[], span: AsmInstructionNode['span']) => boolean;
  evalImmExpr: (expr: Extract<AsmOperandNode, { kind: 'Imm' }>['expr']) => number | undefined;
  resolveScalarTypeForLd: (ea: EaExprNode) => ScalarKind | undefined;
  resolveEa: (ea: EaExprNode, span: AsmInstructionNode['span']) => EaResolution | undefined;
  materializeEaAddressToHL: (ea: EaExprNode, span: AsmInstructionNode['span']) => boolean;
  emitScalarWordLoad: (
    target: 'HL' | 'DE' | 'BC',
    resolved: EaResolution | undefined,
    span: AsmInstructionNode['span'],
  ) => boolean;
  emitScalarWordStore: (
    source: 'HL' | 'DE' | 'BC',
    resolved: EaResolution | undefined,
    span: AsmInstructionNode['span'],
  ) => boolean;
  syncToFlow: () => void;
};

const regOperand = (name: string, span: AsmInstructionNode['span']): AsmOperandNode => ({
  kind: 'Reg',
  span,
  name,
});

const hlMemOperand = (span: AsmInstructionNode['span']): AsmOperandNode => ({
  kind: 'Mem',
  span,
  expr: { kind: 'EaName', span, name: 'HL' },
});

const ixDispMemOperand = (disp: number, span: AsmInstructionNode['span']): AsmOperandNode => ({
  kind: 'Mem',
  span,
  expr:
    disp === 0
      ? { kind: 'EaName', span, name: 'IX' }
      : disp > 0
        ? {
            kind: 'EaAdd',
            span,
            base: { kind: 'EaName', span, name: 'IX' },
            offset: { kind: 'ImmLiteral', span, value: disp },
          }
        : {
            kind: 'EaSub',
            span,
            base: { kind: 'EaName', span, name: 'IX' },
            offset: { kind: 'ImmLiteral', span, value: Math.abs(disp) },
          },
});

const immLiteralOperand = (value: number, span: AsmInstructionNode['span']): AsmOperandNode => ({
  kind: 'Imm',
  span,
  expr: { kind: 'ImmLiteral', span, value },
});

const restoreFlagsAndA = (
  ctx: StepLoweringContext,
  span: AsmInstructionNode['span'],
  restoreHl: boolean,
): boolean => {
  if (restoreHl && !ctx.emitInstr('pop', [regOperand('HL', span)], span)) return false;
  if (!ctx.emitInstr('pop', [regOperand('BC', span)], span)) return false;
  if (!ctx.emitInstr('ld', [regOperand('A', span), regOperand('B', span)], span)) return false;
  if (!ctx.emitInstr('pop', [regOperand('BC', span)], span)) return false;
  return ctx.emitInstr('pop', [regOperand('DE', span)], span);
};

type CanonicalTypedPathStep = {
  target: Extract<AsmOperandNode, { kind: 'Ea' }>;
  amount: number;
};

const getCanonicalTypedPathStep = (
  ctx: StepLoweringContext,
  asmItem: AsmInstructionNode,
): CanonicalTypedPathStep | undefined => {
  const head = asmItem.head.toLowerCase();
  if (head !== 'step') return undefined;
  if (asmItem.operands.length < 1 || asmItem.operands.length > 2) return undefined;

  const target = asmItem.operands[0];
  if (!target || target.kind !== 'Ea') {
    ctx.diagAt(ctx.diagnostics, asmItem.span, '"step" expects a typed-path first operand.');
    return undefined;
  }

  if (asmItem.operands.length === 1) {
    return { target, amount: 1 };
  }

  const amountOperand = asmItem.operands[1];
  if (!amountOperand || amountOperand.kind !== 'Imm') {
    ctx.diagAt(ctx.diagnostics, asmItem.span, '"step" amount must be an immediate compile-time integer expression.');
    return undefined;
  }

  const amount = ctx.evalImmExpr(amountOperand.expr);
  if (amount === undefined) {
    ctx.diagAt(ctx.diagnostics, asmItem.span, '"step" amount must be an immediate compile-time integer expression.');
    return undefined;
  }

  return { target, amount };
};

const emitByteAccumulatorDelta = (
  ctx: StepLoweringContext,
  amount: number,
  span: AsmInstructionNode['span'],
): boolean => {
  const magnitude = Math.abs(amount) % 0x100;
  if (magnitude === 0) return true;
  const op = amount < 0 ? 'sub' : 'add';
  return ctx.emitInstr(op, [regOperand('A', span), immLiteralOperand(magnitude, span)], span);
};

const emitWordDeltaOnHl = (
  ctx: StepLoweringContext,
  amount: number,
  span: AsmInstructionNode['span'],
): boolean => {
  const magnitude = Math.abs(amount) % 0x10000;
  if (magnitude === 0) return true;
  if (!ctx.emitInstr('ld', [regOperand('BC', span), immLiteralOperand(magnitude, span)], span)) return false;
  if (!ctx.emitInstr('or', [regOperand('A', span)], span)) return false;
  const op = amount < 0 ? 'sbc' : 'adc';
  return ctx.emitInstr(op, [regOperand('HL', span), regOperand('BC', span)], span);
};

const lowerUnitTypedPathStep = (
  ctx: StepLoweringContext,
  asmItem: AsmInstructionNode,
  amount: number,
  operand: Extract<AsmOperandNode, { kind: 'Ea' }>,
): boolean => {
  if (operand.explicitAddressOf) {
    ctx.diagAt(ctx.diagnostics, asmItem.span, '"step" does not support address-of operands.');
    return true;
  }

  const scalar = ctx.resolveScalarTypeForLd(operand.expr);
  if (scalar !== 'byte' && scalar !== 'word') {
    ctx.diagAt(ctx.diagnostics, asmItem.span, '"step" only supports byte and word scalar paths.');
    return true;
  }

  const mutateHead = amount < 0 ? 'dec' : 'inc';
  const resolved = ctx.resolveEa(operand.expr, asmItem.span);

  if (scalar === 'byte') {
    if (!ctx.emitInstr('push', [regOperand('DE', asmItem.span)], asmItem.span)) return false;
    if (resolved?.kind === 'stack' && resolved.ixDisp >= -0x80 && resolved.ixDisp <= 0x7f) {
      const mem = ixDispMemOperand(resolved.ixDisp, asmItem.span);
      if (!ctx.emitInstr('ld', [regOperand('E', asmItem.span), mem], asmItem.span)) return false;
      if (!ctx.emitInstr(mutateHead, [regOperand('E', asmItem.span)], asmItem.span)) return false;
      if (!ctx.emitInstr('ld', [mem, regOperand('E', asmItem.span)], asmItem.span)) return false;
      return ctx.emitInstr('pop', [regOperand('DE', asmItem.span)], asmItem.span);
    }

    if (!ctx.emitInstr('push', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.materializeEaAddressToHL(operand.expr, asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [regOperand('E', asmItem.span), hlMemOperand(asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr(mutateHead, [regOperand('E', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [hlMemOperand(asmItem.span), regOperand('E', asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('pop', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    return ctx.emitInstr('pop', [regOperand('DE', asmItem.span)], asmItem.span);
  }

  const directWord = !!resolved && (resolved.kind === 'stack' || (resolved.kind === 'abs' && resolved.addend === 0));
  if (!ctx.emitInstr('push', [regOperand('DE', asmItem.span)], asmItem.span)) return false;
  if (!ctx.emitInstr('push', [regOperand('BC', asmItem.span)], asmItem.span)) return false;
  if (!ctx.emitInstr('push', [regOperand('AF', asmItem.span)], asmItem.span)) return false;

  if (directWord) {
    if (!ctx.emitScalarWordLoad('DE', resolved, asmItem.span)) return false;
  } else {
    if (!ctx.emitInstr('push', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.materializeEaAddressToHL(operand.expr, asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [regOperand('E', asmItem.span), hlMemOperand(asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('inc', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [regOperand('D', asmItem.span), hlMemOperand(asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('dec', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
  }

  if (!ctx.emitInstr(mutateHead, [regOperand('DE', asmItem.span)], asmItem.span)) return false;

  if (directWord) {
    if (!ctx.emitScalarWordStore('DE', resolved, asmItem.span)) return false;
  } else {
    if (!ctx.emitInstr('ld', [hlMemOperand(asmItem.span), regOperand('E', asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('inc', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [hlMemOperand(asmItem.span), regOperand('D', asmItem.span)], asmItem.span))
      return false;
  }

  if (!ctx.emitInstr('ld', [regOperand('A', asmItem.span), regOperand('D', asmItem.span)], asmItem.span))
    return false;
  if (!ctx.emitInstr('or', [regOperand('E', asmItem.span)], asmItem.span)) return false;
  return restoreFlagsAndA(ctx, asmItem.span, !directWord);
};

const lowerTypedPathStep = (
  ctx: StepLoweringContext,
  asmItem: AsmInstructionNode,
  step: CanonicalTypedPathStep,
): boolean => {
  const { target, amount } = step;
  if (target.explicitAddressOf) {
    ctx.diagAt(ctx.diagnostics, asmItem.span, '"step" does not support address-of operands.');
    return true;
  }

  const scalar = ctx.resolveScalarTypeForLd(target.expr);
  if (scalar !== 'byte' && scalar !== 'word') {
    ctx.diagAt(ctx.diagnostics, asmItem.span, '"step" only supports byte and word scalar paths.');
    return true;
  }

  if (amount === 0) return true;

  if (amount === 1 || amount === -1) {
    return lowerUnitTypedPathStep(ctx, asmItem, amount, target);
  }

  const resolved = ctx.resolveEa(target.expr, asmItem.span);

  if (scalar === 'byte') {
    if (!ctx.emitInstr('push', [regOperand('DE', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('push', [regOperand('BC', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('push', [regOperand('AF', asmItem.span)], asmItem.span)) return false;

    if (resolved?.kind === 'stack' && resolved.ixDisp >= -0x80 && resolved.ixDisp <= 0x7f) {
      const mem = ixDispMemOperand(resolved.ixDisp, asmItem.span);
      if (!ctx.emitInstr('ld', [regOperand('A', asmItem.span), mem], asmItem.span)) return false;
      if (!emitByteAccumulatorDelta(ctx, amount, asmItem.span)) return false;
      if (!ctx.emitInstr('ld', [mem, regOperand('A', asmItem.span)], asmItem.span)) return false;
      return restoreFlagsAndA(ctx, asmItem.span, false);
    }

    if (!ctx.emitInstr('push', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.materializeEaAddressToHL(target.expr, asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [regOperand('A', asmItem.span), hlMemOperand(asmItem.span)], asmItem.span))
      return false;
    if (!emitByteAccumulatorDelta(ctx, amount, asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [hlMemOperand(asmItem.span), regOperand('A', asmItem.span)], asmItem.span))
      return false;
    return restoreFlagsAndA(ctx, asmItem.span, true);
  }

  const directWord = !!resolved && (resolved.kind === 'stack' || (resolved.kind === 'abs' && resolved.addend === 0));
  if (!ctx.emitInstr('push', [regOperand('DE', asmItem.span)], asmItem.span)) return false;
  if (!ctx.emitInstr('push', [regOperand('BC', asmItem.span)], asmItem.span)) return false;
  if (!ctx.emitInstr('push', [regOperand('AF', asmItem.span)], asmItem.span)) return false;

  if (directWord) {
    if (!ctx.emitScalarWordLoad('HL', resolved, asmItem.span)) return false;
  } else {
    if (!ctx.emitInstr('push', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.materializeEaAddressToHL(target.expr, asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [regOperand('E', asmItem.span), hlMemOperand(asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('inc', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [regOperand('D', asmItem.span), hlMemOperand(asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('dec', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('ex', [regOperand('DE', asmItem.span), regOperand('HL', asmItem.span)], asmItem.span))
      return false;
  }

  if (!emitWordDeltaOnHl(ctx, amount, asmItem.span)) return false;

  if (directWord) {
    if (!ctx.emitScalarWordStore('HL', resolved, asmItem.span)) return false;
  } else {
    if (!ctx.emitInstr('ex', [regOperand('DE', asmItem.span), regOperand('HL', asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('ld', [hlMemOperand(asmItem.span), regOperand('E', asmItem.span)], asmItem.span))
      return false;
    if (!ctx.emitInstr('inc', [regOperand('HL', asmItem.span)], asmItem.span)) return false;
    if (!ctx.emitInstr('ld', [hlMemOperand(asmItem.span), regOperand('D', asmItem.span)], asmItem.span))
      return false;
  }

  return restoreFlagsAndA(ctx, asmItem.span, !directWord);
};

export function tryLowerStepInstruction(
  asmItem: AsmInstructionNode,
  ctx: StepLoweringContext,
): boolean | undefined {
  const typedPathStep = getCanonicalTypedPathStep(ctx, asmItem);
  if (!typedPathStep) return undefined;
  if (!lowerTypedPathStep(ctx, asmItem, typedPathStep)) return false;
  ctx.syncToFlow();
  return true;
}
