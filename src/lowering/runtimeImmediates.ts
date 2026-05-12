import type { AsmOperandNode, SourceSpan } from '../frontend/ast.js';

type RuntimeImmediateContext = {
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
};

export function createRuntimeImmediateHelpers(ctx: RuntimeImmediateContext) {
  const loadImm16ToHL = (n: number, span: SourceSpan): boolean => {
    return ctx.emitInstr(
      'ld',
      [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: n } },
      ],
      span,
    );
  };

  const loadImm16ToDE = (n: number, span: SourceSpan): boolean => {
    return ctx.emitInstr(
      'ld',
      [
        { kind: 'Reg', span, name: 'DE' },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: n } },
      ],
      span,
    );
  };

  const pushImm16 = (n: number, span: SourceSpan): boolean => {
    if (!loadImm16ToHL(n, span)) return false;
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const negateHL = (span: SourceSpan): boolean => {
    if (
      !ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'A' },
          { kind: 'Reg', span, name: 'H' },
        ],
        span,
      )
    ) {
      return false;
    }
    if (!ctx.emitInstr('cpl', [], span)) return false;
    if (
      !ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'H' },
          { kind: 'Reg', span, name: 'A' },
        ],
        span,
      )
    ) {
      return false;
    }
    if (
      !ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'A' },
          { kind: 'Reg', span, name: 'L' },
        ],
        span,
      )
    ) {
      return false;
    }
    if (!ctx.emitInstr('cpl', [], span)) return false;
    if (
      !ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'L' },
          { kind: 'Reg', span, name: 'A' },
        ],
        span,
      )
    ) {
      return false;
    }
    return ctx.emitInstr('inc', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const pushZeroExtendedReg8 = (r: string, span: SourceSpan): boolean => {
    if (
      !ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'H' },
          { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
        ],
        span,
      )
    ) {
      return false;
    }
    if (
      !ctx.emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'L' },
          { kind: 'Reg', span, name: r },
        ],
        span,
      )
    ) {
      return false;
    }
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  return {
    loadImm16ToDE,
    loadImm16ToHL,
    negateHL,
    pushImm16,
    pushZeroExtendedReg8,
  };
}
