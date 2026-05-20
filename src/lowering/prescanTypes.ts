import type { OpDeclNode, TypeExprNode } from '../frontend/ast.js';

export interface PrescanResult {
  /** Frozen per-file op maps. */
  readonly localOpsByFile: ReadonlyMap<string, ReadonlyMap<string, OpDeclNode[]>>;
  /** Frozen merged op visibility. */
  readonly visibleOpsByName: ReadonlyMap<string, OpDeclNode[]>;
  /** Declared `op` names (lowercased). */
  readonly declaredOpNames: ReadonlySet<string>;
  /** Global/storage types discovered in prescan. */
  readonly storageTypes: ReadonlyMap<string, TypeExprNode>;
  /** Raw address symbol names. */
  readonly rawAddressSymbols: ReadonlySet<string>;
}
