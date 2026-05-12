import type { AsmItemNode, SourceSpan } from '../frontend/ast.js';
import type { FlowState } from './functionBodySetup.js';

type AsmBodyOrchestrationContext = {
  asmItems: readonly AsmItemNode[];
  itemName: string;
  itemSpan: SourceSpan;
  emitSyntheticEpilogue: boolean;
  hasStackSlots: boolean;
  lowerAsmRange: (asmItems: readonly AsmItemNode[], startIndex: number, stopKinds: Set<string>) => number;
  syncToFlow: () => void;
  getFlow: () => FlowState;
  setFlow: (state: FlowState) => void;
  diagAt: (span: SourceSpan, message: string) => void;
  emitImplicitRet: () => void;
  emitSyntheticEpilogueBody: () => void;
  traceFunctionEnd: () => void;
};

export function createAsmBodyOrchestrationHelpers(ctx: AsmBodyOrchestrationContext) {
  const lowerAndFinalizeFunctionBody = (): void => {
    const consumed = ctx.lowerAsmRange(ctx.asmItems, 0, new Set());
    if (consumed < ctx.asmItems.length) {
      ctx.diagAt(ctx.asmItems[consumed]!.span, 'Internal control-flow lowering error.');
    }

    ctx.syncToFlow();

    if (ctx.emitSyntheticEpilogue) {
      ctx.setFlow({
        ...ctx.getFlow(),
        spDelta: 0,
        spValid: true,
        spInvalidDueToMutation: false,
      });
    }

    const flow = ctx.getFlow();
    if (flow.reachable && flow.spValid && flow.spDelta !== 0) {
      ctx.diagAt(
        ctx.itemSpan,
        `Function "${ctx.itemName}" has non-zero stack delta at fallthrough (${flow.spDelta}).`,
      );
    } else if (flow.reachable && !flow.spValid && flow.spInvalidDueToMutation && ctx.hasStackSlots) {
      ctx.diagAt(
        ctx.itemSpan,
        `Function "${ctx.itemName}" has untracked SP mutation at fallthrough; cannot verify stack balance.`,
      );
    } else if (flow.reachable && !flow.spValid && ctx.hasStackSlots) {
      ctx.diagAt(
        ctx.itemSpan,
        `Function "${ctx.itemName}" has unknown stack depth at fallthrough; cannot verify stack balance.`,
      );
    }

    if (!ctx.emitSyntheticEpilogue && flow.reachable) {
      ctx.emitImplicitRet();
      ctx.setFlow({
        ...ctx.getFlow(),
        reachable: false,
      });
      ctx.syncToFlow();
    }

    if (ctx.emitSyntheticEpilogue) {
      ctx.emitSyntheticEpilogueBody();
    }

    ctx.traceFunctionEnd();
  };

  return {
    lowerAndFinalizeFunctionBody,
  };
}
