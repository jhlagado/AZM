import type { SourceSpan } from '../frontend/ast.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';

/**
 * HL-indirect word load/store primitives (through LOAD_RP_EA / STORE_RP_EA pipelines).
 * Pure execution: no EA decomposition or strategy selection.
 */
export function createHlWordTransport(ctx: ValueMaterializationContext) {
  const emitLoadWordFromHlAddress = (target: 'HL' | 'DE' | 'BC', span: SourceSpan): boolean => {
    if (target === 'DE') {
      return ctx.emitStepPipeline(ctx.LOAD_RP_EA('DE'), span);
    }
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!ctx.emitStepPipeline(ctx.LOAD_RP_EA(target), span)) return false;
    return ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span);
  };

  const emitStoreWordToHlAddress = (source: 'DE' | 'BC', span: SourceSpan): boolean =>
    ctx.emitStepPipeline(ctx.STORE_RP_EA(source), span);

  return { emitLoadWordFromHlAddress, emitStoreWordToHlAddress };
}
