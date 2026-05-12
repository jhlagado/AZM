import type {
  ExternFuncNode,
  FuncDeclNode,
  TypeExprNode,
} from '../frontend/ast.js';
import type { EmittedSourceSegment } from '../formats/types.js';

export type SectionKind = 'code' | 'data' | 'var';

export type PendingSymbol = {
  /** What kind of symbol is pending resolution. */
  kind: 'label' | 'data' | 'var';
  /** Declared name (not yet bound to an address). */
  name: string;
  /** Target section for the symbol. */
  section: SectionKind;
  /** Tentative offset within the section; refined at finalize. */
  offset: number;
  /** Source file when known; omit for synthetic entries. */
  file?: string;
  /** 1-based source line when known. */
  line?: number;
  /** Local vs global visibility when applicable. */
  scope?: 'global' | 'local';
  /** Byte size for data/var when known. */
  size?: number;
};

export type SourceSegmentTag = Omit<EmittedSourceSegment, 'start' | 'end'>;

export type Callable =
  | { kind: 'func'; node: FuncDeclNode }
  | { kind: 'extern'; node: ExternFuncNode; targetLower: string };

/** Array shape extracted for lowering; `length` omitted when unknown. */
export type ResolvedArrayType = {
  element: TypeExprNode;
  length?: number;
};
