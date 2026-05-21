import type { Expression } from './expression.js';
import type { SourceSpan } from '../source/source-span.js';

export type SourceItem =
  | { readonly kind: 'org'; readonly expression: Expression; readonly span: SourceSpan }
  | {
      readonly kind: 'equ';
      readonly name: string;
      readonly expression: Expression;
      readonly span: SourceSpan;
    }
  | { readonly kind: 'label'; readonly name: string; readonly span: SourceSpan }
  | { readonly kind: 'db'; readonly values: readonly Expression[]; readonly span: SourceSpan }
  | { readonly kind: 'dw'; readonly values: readonly Expression[]; readonly span: SourceSpan }
  | { readonly kind: 'ds'; readonly size: Expression; readonly span: SourceSpan }
  | { readonly kind: 'instruction'; readonly instruction: Instruction; readonly span: SourceSpan };

export type Instruction =
  | { readonly mnemonic: 'nop' }
  | { readonly mnemonic: 'ret' }
  | { readonly mnemonic: 'ld-a-imm'; readonly expression: Expression };
