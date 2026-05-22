import type { SourceSpan } from '../source/source-span.js';

export interface FixupTarget {
  readonly symbol: string;
  readonly addend: number;
}

export type Fixup =
  | {
      readonly kind: 'abs16';
      readonly offset: number;
      readonly target: FixupTarget;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'rel8';
      readonly offset: number;
      readonly origin: number;
      readonly target: FixupTarget;
      readonly mnemonic: string;
      readonly span: SourceSpan;
    };
