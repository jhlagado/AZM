import type { SourceItemNode } from '../frontend/ast.js';

type DeclNode = SourceItemNode;

export type DeclVisitContext = Record<string, never>;

export function visitDeclTree(
  items: SourceItemNode[],
  visit: (item: DeclNode, ctx: DeclVisitContext) => void,
): void {
  const walkEntry = (
    entry: SourceItemNode,
    ctx: DeclVisitContext,
  ): void => {
    if (entry.kind === 'AsmLabel' || entry.kind === 'AsmInstruction') {
      return;
    }
    visit(entry as DeclNode, ctx);
  };

  for (const item of items) {
    walkEntry(item, {});
  }
}
