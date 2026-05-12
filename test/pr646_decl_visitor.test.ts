import { describe, expect, it } from 'vitest';

import type {
  ImportNode,
  ModuleItemNode,
  NamedSectionNode,
  SourceSpan,
} from '../src/frontend/ast.js';
import { visitDeclTree } from '../src/semantics/declVisitor.js';

const span: SourceSpan = {
  file: 'pr646.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

describe('PR646 declaration-tree visitor', () => {
  it('walks module and named-section declarations with context', () => {
    const importNode: ImportNode = {
      kind: 'Import',
      span,
      specifier: 'dep',
      form: 'moduleId',
    };
    const sectionNode: NamedSectionNode = {
      kind: 'NamedSection',
      span,
      section: 'code',
      name: 'boot',
      items: [
        {
          kind: 'ConstDecl',
          span,
          name: 'Inside',
          exported: false,
          value: { kind: 'ImmLiteral', span, value: 1 },
        },
      ],
    };

    const items: ModuleItemNode[] = [
      importNode,
      sectionNode,
      {
        kind: 'ConstDecl',
        span,
        name: 'Top',
        exported: false,
        value: { kind: 'ImmLiteral', span, value: 2 },
      },
    ];

    const visited: Array<{ kind: string; inNamedSection: boolean; section?: string }> = [];
    visitDeclTree(items, (item, ctx) => {
      visited.push({
        kind: item.kind,
        inNamedSection: ctx.inNamedSection,
        ...(ctx.section ? { section: ctx.section.name } : {}),
      });
    });

    expect(visited).toEqual([
      { kind: 'Import', inNamedSection: false },
      { kind: 'ConstDecl', inNamedSection: true, section: 'boot' },
      { kind: 'ConstDecl', inNamedSection: false },
    ]);
  });
});
