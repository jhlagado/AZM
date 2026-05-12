import type { CompileEnv } from '../semantics/env.js';
import { moduleQualifierOf } from '../moduleVisibility.js';
import type { Callable } from './loweringTypes.js';
import type { OpDeclNode } from '../frontend/ast.js';

type EmitVisibilityContext = {
  /** Compile environment (module ids, imports) used with visibility maps. */
  env: CompileEnv;
  /** Per-file map of lowered callables keyed by lowercased name. */
  localCallablesByFile: Map<string, Map<string, Callable>>;
  /** Flat map of visible callables across the program (qualified and unqualified resolution). */
  visibleCallables: Map<string, Callable>;
  /** Per-file op overload lists keyed by lowercased op name. */
  localOpsByFile: Map<string, Map<string, OpDeclNode[]>>;
  /** Merged visible op candidates by lowercased name. */
  visibleOpsByName: Map<string, OpDeclNode[]>;
};

export function createEmitVisibilityHelpers(ctx: EmitVisibilityContext) {
  const canAccessLoweredQualifiedName = (name: string, file: string): boolean => {
    const qualifier = moduleQualifierOf(name);
    if (!qualifier) return true;
    const currentModuleId = ctx.env.moduleIds?.get(file)?.toLowerCase();
    if (currentModuleId === qualifier) return true;
    const imported = ctx.env.importedModuleIds?.get(file);
    if (!imported) return true;
    for (const importedId of imported) {
      if (importedId.toLowerCase() === qualifier) return true;
    }
    return false;
  };

  const resolveVisibleCallable = (name: string, file: string): Callable | undefined => {
    const lower = name.toLowerCase();
    const qualifier = moduleQualifierOf(lower);
    if (!qualifier) {
      const local = ctx.localCallablesByFile.get(file)?.get(lower);
      if (local) return local;
      const imported = ctx.env.importedModuleIds?.get(file);
      if (!imported) return undefined;
      for (const importedId of imported) {
        for (const [candidateFile, moduleId] of ctx.env.moduleIds ?? []) {
          if (moduleId.toLowerCase() !== importedId.toLowerCase()) continue;
          const importedCallable = ctx.localCallablesByFile.get(candidateFile)?.get(lower);
          if (importedCallable?.kind === 'extern') return importedCallable;
        }
      }
      return undefined;
    }
    const currentModuleId = ctx.env.moduleIds?.get(file)?.toLowerCase();
    if (currentModuleId === qualifier) {
      const localName = lower.slice(qualifier.length + 1);
      return ctx.localCallablesByFile.get(file)?.get(localName);
    }
    if (!canAccessLoweredQualifiedName(lower, file)) return undefined;
    return ctx.visibleCallables.get(lower);
  };

  const resolveVisibleOpCandidates = (name: string, file: string): OpDeclNode[] | undefined => {
    const lower = name.toLowerCase();
    const qualifier = moduleQualifierOf(lower);
    if (!qualifier) return ctx.localOpsByFile.get(file)?.get(lower);
    const currentModuleId = ctx.env.moduleIds?.get(file)?.toLowerCase();
    if (currentModuleId === qualifier) {
      const localName = lower.slice(qualifier.length + 1);
      return ctx.localOpsByFile.get(file)?.get(localName);
    }
    if (!canAccessLoweredQualifiedName(lower, file)) return undefined;
    return ctx.visibleOpsByName.get(lower);
  };

  return {
    resolveVisibleCallable,
    resolveVisibleOpCandidates,
  };
}