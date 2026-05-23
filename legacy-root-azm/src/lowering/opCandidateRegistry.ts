import type { OpDeclNode } from '../frontend/ast.js';

type OpCandidateRegistryContext = {
  /** Per-file op overload lists keyed by lowercased op name. */
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
};

export function createOpCandidateRegistryHelpers(ctx: OpCandidateRegistryContext) {
  const resolveOpCandidatesForFile = (name: string, file: string): OpDeclNode[] | undefined => {
    const lower = name.toLowerCase();
    return ctx.localOpsByFile.get(file)?.get(lower);
  };

  return {
    resolveOpCandidatesForFile,
  };
}
