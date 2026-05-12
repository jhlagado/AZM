import type { TypeExprNode } from '../frontend/ast.js';
import { diag, diagAt } from './loweringDiagnostics.js';
import type { EmitPhase1HelpersContext } from './emitPhase1Types.js';

/** Infers storage types for module aliases before emit (same behavior as inline loop in emit phase 1). */
export function bootstrapModuleAliasStorageTypes(
  ctx: EmitPhase1HelpersContext,
  resolveEaTypeExpr: (ea: import('../frontend/ast.js').EaExprNode) => TypeExprNode | undefined,
): void {
  for (const [aliasLower, aliasTarget] of ctx.workspace.storage.moduleAliasTargets) {
    if (ctx.workspace.storage.storageTypes.has(aliasLower)) continue;
    const inferred = resolveEaTypeExpr(aliasTarget);
    if (!inferred) {
      const decl = ctx.workspace.storage.moduleAliasDecls.get(aliasLower);
      const target = decl?.name ?? aliasLower;
      if (decl) {
        diagAt(
          ctx.diagnostics,
          decl.span,
          `Incompatible inferred alias binding for "${target}": unable to infer type from alias source.`,
        );
      } else {
        diag(
          ctx.diagnostics,
          ctx.program.entryFile,
          `Incompatible inferred alias binding for "${target}": unable to infer type from alias source.`,
        );
      }
      continue;
    }
    ctx.workspace.storage.storageTypes.set(aliasLower, inferred);
  }
}
