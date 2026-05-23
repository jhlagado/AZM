import { describe, expect, it } from 'vitest';

import type { SourceItemNode, SourceSpan } from '../src/frontend/ast.js';
import { visitDeclTree } from '../src/semantics/declVisitor.js';

const span: SourceSpan = {
  file: 'pr646.asm',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('PR646 declaration-tree visitor', () => {
  it('walks source declarations with context', () => {
    const items: SourceItemNode[] = [
      {
        kind: 'AsmEqu',
        span,
        name: 'Top',
        exprText: '2',
      },
    ];

    const visited: Array<{ kind: string }> = [];
    visitDeclTree(items, (item) => {
      visited.push({
        kind: item.kind,
      });
    });

    expect(visited).toEqual([{ kind: 'AsmEqu' }]);
  });
});
