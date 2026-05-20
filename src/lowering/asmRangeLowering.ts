import type { AsmInstructionNode, AsmItemNode, SourceSpan } from '../frontend/ast.js';
import type { FlowState } from './functionBodySetup.js';

type Context<TCodeSegmentTag> = {
  sourceTagForSpan: (span: SourceSpan) => TCodeSegmentTag;
  getCurrentCodeSegmentTag: () => TCodeSegmentTag | undefined;
  setCurrentCodeSegmentTag: (tag: TCodeSegmentTag | undefined) => void;
  defineCodeLabel: (name: string, span: SourceSpan, scope: 'global' | 'local') => void;
  emitAsmInstruction: (item: AsmInstructionNode) => void;
  flowRef: { readonly current: FlowState };
  syncFromFlow: () => void;
};

export function createAsmRangeLoweringHelpers<TCodeSegmentTag>(ctx: Context<TCodeSegmentTag>) {
  const lowerAsmRange = (
    asmItems: readonly AsmItemNode[],
    startIndex: number,
    stopKinds: Set<string>,
  ): number => {
    let i = startIndex;
    while (i < asmItems.length) {
      const item = asmItems[i]!;
      if (stopKinds.has(item.kind)) return i;
      const prevTag = ctx.getCurrentCodeSegmentTag();
      ctx.setCurrentCodeSegmentTag(ctx.sourceTagForSpan(item.span));
      try {
        if (item.kind === 'AsmLabel') {
          ctx.defineCodeLabel(item.name, item.span, 'global');
          if (!ctx.flowRef.current.reachable) {
            ctx.flowRef.current.reachable = true;
            ctx.flowRef.current.spValid = false;
            ctx.flowRef.current.spDelta = 0;
            ctx.flowRef.current.spInvalidDueToMutation = false;
            ctx.syncFromFlow();
          }
          i++;
          continue;
        }
        if (item.kind === 'AsmInstruction') {
          ctx.emitAsmInstruction(item);
          i++;
          continue;
        }
      } finally {
        ctx.setCurrentCodeSegmentTag(prevTag);
      }
      i++;
    }
    return i;
  };

  return {
    lowerAsmRange,
  };
}
