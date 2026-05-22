import type { Expression } from './expression.js';
import type { SourceSpan } from '../source/source-span.js';
import type { Z80Instruction } from '../z80/instruction.js';

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
  | {
      readonly kind: 'string-data';
      readonly directive: 'cstr' | 'pstr' | 'istr';
      readonly value: string;
      readonly span: SourceSpan;
    }
  | { readonly kind: 'instruction'; readonly instruction: Instruction; readonly span: SourceSpan };

export type Instruction = Z80Instruction;
