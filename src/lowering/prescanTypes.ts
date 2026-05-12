import type { EaExprNode, OpDeclNode, TypeExprNode, VarDeclNode } from '../frontend/ast.js';
import type { Callable } from './loweringTypes.js';

export interface PrescanResult {
  /** Frozen per-file callable maps from prescan. */
  readonly localCallablesByFile: ReadonlyMap<string, ReadonlyMap<string, Callable>>;
  /** Frozen merged callable visibility. */
  readonly visibleCallables: ReadonlyMap<string, Callable>;
  /** Frozen per-file op maps. */
  readonly localOpsByFile: ReadonlyMap<string, ReadonlyMap<string, OpDeclNode[]>>;
  /** Frozen merged op visibility. */
  readonly visibleOpsByName: ReadonlyMap<string, OpDeclNode[]>;
  /** Declared `op` names (lowercased). */
  readonly declaredOpNames: ReadonlySet<string>;
  /** Declared `bin` names. */
  readonly declaredBinNames: ReadonlySet<string>;
  /** Global/storage types discovered in prescan. */
  readonly storageTypes: ReadonlyMap<string, TypeExprNode>;
  /** Module alias EA targets. */
  readonly moduleAliasTargets: ReadonlyMap<string, EaExprNode>;
  /** Alias declarations for later diagnostics. */
  readonly moduleAliasDecls: ReadonlyMap<string, VarDeclNode>;
  /** Raw address symbol names. */
  readonly rawAddressSymbols: ReadonlySet<string>;
}
