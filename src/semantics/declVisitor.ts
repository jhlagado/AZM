import type {
  ModuleItemNode,
  NamedSectionNode,
  SectionItemNode,
} from '../frontend/ast.js';

type DeclNode = Exclude<ModuleItemNode | SectionItemNode, NamedSectionNode>;

export type DeclVisitContext = {
  inNamedSection: boolean;
  section?: NamedSectionNode;
};

export function visitDeclTree(
  items: ModuleItemNode[],
  visit: (item: DeclNode, ctx: DeclVisitContext) => void,
): void {
  const walkEntry = (
    entry: ModuleItemNode | SectionItemNode,
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
    if (entry.kind === 'NamedSection') {
      for (const sectionItem of entry.items) {
        walkEntry(sectionItem, { inNamedSection: true, section: entry });
      }
      return;
    }
    visit(entry as DeclNode, ctx);
  };

  for (const item of items) {
    walkEntry(item, { inNamedSection: false });
  }
}
