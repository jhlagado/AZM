import { describe, expect, it } from 'vitest';

import type { ModuleItemNode, SourceSpan } from '../src/frontend/ast.js';
import { visitDeclTree } from '../src/semantics/declVisitor.js';

const span: SourceSpan = {
  file: 'pr646.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('PR646 declaration-tree visitor', () => {
  it('walks module declarations with context', () => {
    const items: ModuleItemNode[] = [
      {
        kind: 'ClassicEqu',
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

    expect(visited).toEqual([
      { kind: 'ClassicEqu' },
    ]);
  });
});
