/**
 * typeResolution.ts — lowering-layer re-export shim.
 *
 * The canonical implementation lives in `src/semantics/typeQueries.ts`.
 * This shim exists so that existing lowering-layer imports continue to
 * resolve without change.  Do not add implementation here.
 */

export {
  createTypeResolutionHelpers,
} from '../semantics/typeQueries.js';

export type {
  ScalarKind,
  AggregateType,
} from '../semantics/typeQueries.js';
