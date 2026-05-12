import { describe, expect, it } from 'vitest';

import { createOpStackAnalysisHelpers } from '../src/lowering/opStackAnalysis.js';
import type { OpDeclNode } from '../src/frontend/ast.js';

const span = {
  file: 'test.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const opDecl = (name: string, items: OpDeclNode['body']['items']): OpDeclNode =>
  ({
    kind: 'OpDecl',
    span,
    name,
    params: [],
    body: { kind: 'AsmBlock', span, items },
  }) as unknown as OpDeclNode;

describe('PR554: extracted op stack analysis helpers', () => {
  it('summarizes simple stack deltas and SP mutation', () => {
    const leaf = opDecl('leaf', [
      {
        kind: 'AsmInstruction',
        span,
        head: 'push',
        operands: [{ kind: 'Reg', span, name: 'HL' }],
      },
      {
        kind: 'AsmInstruction',
        span,
        head: 'ld',
        operands: [
          { kind: 'Reg', span, name: 'SP' },
          { kind: 'Reg', span, name: 'HL' },
        ],
      },
      {
        kind: 'AsmInstruction',
        span,
        head: 'pop',
        operands: [{ kind: 'Reg', span, name: 'HL' }],
      },
    ]);

    const { summarizeOpStackEffect } = createOpStackAnalysisHelpers({
      resolveOpCandidates: (name: string) => (name.toLowerCase() === 'leaf' ? [leaf] : undefined),
    });

    expect(summarizeOpStackEffect(leaf)).toEqual({
      kind: 'known',
      delta: 0,
      hasUntrackedSpMutation: true,
    });
  });

  it('marks recursive op cycles as complex', () => {
    const recur = opDecl('recur', [
      {
        kind: 'AsmInstruction',
        span,
        head: 'recur',
        operands: [],
      },
    ]);

    const { summarizeOpStackEffect } = createOpStackAnalysisHelpers({
      resolveOpCandidates: (name: string) => (name.toLowerCase() === 'recur' ? [recur] : undefined),
    });

    expect(summarizeOpStackEffect(recur)).toEqual({ kind: 'complex' });
  });
});
