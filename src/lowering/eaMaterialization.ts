import type { AsmOperandNode, EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';

/** Inputs for {@link createEaMaterializationHelpers} — emission hooks plus `resolveEa`, not the EA type-resolution bag (`EAResolutionContext`). */
export type EAMaterializationContext = {
  /** Resolves an EA to storage/abs form; `undefined` means unresolved (caller may use push path). */
  resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  /** Materializes unresolved EA via push sequence; `false` on failure. */
  pushEaAddress: (ea: EaExprNode, span: SourceSpan) => boolean;
  /** Emits one encoded instruction; `false` if encoding failed. */
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  /** Queues a 16-bit absolute fixup (e.g. LD HL, sym+off). */
  emitAbs16Fixup: (opcode: number, target: string, addend: number, span: SourceSpan) => void;
  /** Loads a 16-bit immediate into DE; `false` if emission failed. */
  loadImm16ToDE: (value: number, span: SourceSpan) => boolean;
};

export function createEaMaterializationHelpers(ctx: EAMaterializationContext) {
  const materializeEaAddressToHL = (ea: EaExprNode, span: SourceSpan): boolean => {
    const resolved = ctx.resolveEa(ea, span);
    if (!resolved) {
      if (!ctx.pushEaAddress(ea, span)) return false;
      return ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
    }

    if (resolved.kind === 'abs') {
      ctx.emitAbs16Fixup(0x21, resolved.baseLower, resolved.addend, span);
      return true;
    }
    if (!ctx.pushEaAddress(ea, span)) return false;
    return ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  return {
    materializeEaAddressToHL,
  };
}
