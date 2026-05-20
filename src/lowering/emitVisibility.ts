import type { CompileEnv } from '../semantics/env.js';
import type { OpDeclNode } from '../frontend/ast.js';

type EmitVisibilityContext = {
  /** Compile environment (module ids, imports) used with visibility maps. */
  env: CompileEnv;
  /** Per-file op overload lists keyed by lowercased op name. */
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  /** Merged visible op candidates by lowercased name. */
  visibleOpsByName: Map<string, OpDeclNode[]>;
};

export function createEmitVisibilityHelpers(ctx: EmitVisibilityContext) {
  const resolveVisibleOpCandidates = (name: string, file: string): OpDeclNode[] | undefined => {
    const lower = name.toLowerCase();
    return ctx.localOpsByFile.get(file)?.get(lower) ?? ctx.visibleOpsByName.get(lower);
  };

  return {
    resolveVisibleOpCandidates,
  };
}
