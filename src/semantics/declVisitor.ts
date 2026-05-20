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
    if (
      entry.kind === 'AsmLabel' ||
      entry.kind === 'AsmInstruction' ||
      entry.kind === 'If' ||
      entry.kind === 'Else' ||
      entry.kind === 'End' ||
      entry.kind === 'While' ||
      entry.kind === 'Repeat' ||
      entry.kind === 'Until' ||
      entry.kind === 'Break' ||
      entry.kind === 'Continue' ||
      entry.kind === 'Select' ||
      entry.kind === 'Case' ||
      entry.kind === 'SelectElse'
    ) {
      return;
    }
    visit(entry as DeclNode, ctx);
  };

  for (const item of items) {
    walkEntry(item, {});
  }
}
