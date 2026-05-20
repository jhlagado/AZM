import { describe, expect, it } from 'vitest';

import type {
  ImportNode,
  ModuleItemNode,
  SourceSpan,
} from '../src/frontend/ast.js';
import { visitDeclTree } from '../src/semantics/declVisitor.js';

const span: SourceSpan = {
  file: 'pr646.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('PR646 declaration-tree visitor', () => {
  it('walks module declarations with context', () => {
    const importNode: ImportNode = {
      kind: 'Import',
      span,
      specifier: 'dep',
      form: 'moduleId',
    };
    const items: ModuleItemNode[] = [
      importNode,
      {
        kind: 'ConstDecl',
        span,
        name: 'Top',
        exported: false,
        value: { kind: 'ImmLiteral', span, value: 2 },
      },
    ];

    const visited: Array<{ kind: string }> = [];
    visitDeclTree(items, (item) => {
      visited.push({
        kind: item.kind,
      });
    });

    expect(visited).toEqual([
      { kind: 'Import' },
      { kind: 'ConstDecl' },
    ]);
  });
});
