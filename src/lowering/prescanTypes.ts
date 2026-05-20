import type { OpDeclNode } from '../frontend/ast.js';

export interface PrescanResult {
  /** Frozen per-file op maps. */
  readonly localOpsByFile: ReadonlyMap<string, ReadonlyMap<string, OpDeclNode[]>>;
  /** Declared `op` names (lowercased). */
  readonly declaredOpNames: ReadonlySet<string>;
}
