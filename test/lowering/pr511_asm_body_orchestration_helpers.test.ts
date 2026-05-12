import { describe, expect, it } from 'vitest';

import type { AsmItemNode, SourceSpan } from '../../src/frontend/ast.js';
import { createAsmBodyOrchestrationHelpers } from '../../src/lowering/asmBodyOrchestration.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

describe('#511 asm body orchestration helpers', () => {
  it('keeps non-epilogue fallthrough routing stable', () => {
    let flow = {
      reachable: true,
      spDelta: 0,
      spValid: true,
      spInvalidDueToMutation: false,
    };
    let implicitRetCount = 0;
    let syntheticCount = 0;
    let traceCount = 0;
    const diagnostics: string[] = [];

    const { lowerAndFinalizeFunctionBody } = createAsmBodyOrchestrationHelpers({
      asmItems: [] as AsmItemNode[],
      itemName: 'main',
      itemSpan: span,
      emitSyntheticEpilogue: false,
      hasStackSlots: false,
      lowerAsmRange: () => 0,
      syncToFlow: () => {},
      getFlow: () => flow,
      setFlow: (state) => {
        flow = state;
      },
      diagAt: (_span, message) => {
        diagnostics.push(message);
      },
      emitImplicitRet: () => {
        implicitRetCount++;
      },
      emitSyntheticEpilogueBody: () => {
        syntheticCount++;
      },
      traceFunctionEnd: () => {
        traceCount++;
      },
    });

    lowerAndFinalizeFunctionBody();

    expect(diagnostics).toEqual([]);
    expect(implicitRetCount).toBe(1);
    expect(syntheticCount).toBe(0);
    expect(traceCount).toBe(1);
    expect(flow.reachable).toBe(false);
  });
});
