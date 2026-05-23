import type { TypeExprNode } from '../frontend/ast.js';
import type { EmittedSourceSegment } from '../formats/types.js';

export type PlacementKind = 'code' | 'data';

export type PendingSymbol = {
  /** What kind of symbol is pending resolution. */
  kind: 'label' | 'data';
  /** Declared name (not yet bound to an address). */
  name: string;
  /** Target placement for the symbol. */
  placement: PlacementKind;
  /** Tentative offset within the placement; refined at finalize. */
  offset: number;
  /** Source file when known; omit for synthetic entries. */
  file?: string;
  /** 1-based source line when known. */
  line?: number;
  /** Local vs global source scope when applicable. */
  scope?: 'global' | 'local';
  /** Byte size for data when known. */
  size?: number;
};

export type SourceSegmentTag = Omit<EmittedSourceSegment, 'start' | 'end'>;

/** Array shape extracted for lowering; `length` omitted when unknown. */
export type ResolvedArrayType = {
  element: TypeExprNode;
  length?: number;
};
