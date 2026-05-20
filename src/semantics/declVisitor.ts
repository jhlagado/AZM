import type { ModuleItemNode } from '../frontend/ast.js';

type DeclNode = ModuleItemNode;

export type DeclVisitContext = Record<string, never>;

export function visitDeclTree(
  items: ModuleItemNode[],
  visit: (item: DeclNode, ctx: DeclVisitContext) => void,
): void {
  const walkEntry = (
    entry: ModuleItemNode,
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
