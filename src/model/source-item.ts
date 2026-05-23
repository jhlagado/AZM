import type { Expression, TypeExpr } from './expression.js';
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
  | { readonly kind: 'db'; readonly values: readonly DataValue[]; readonly span: SourceSpan }
  | { readonly kind: 'dw'; readonly values: readonly Expression[]; readonly span: SourceSpan }
  | {
      readonly kind: 'ds';
      readonly size: Expression;
      readonly fill?: Expression;
      readonly span: SourceSpan;
    }
  | { readonly kind: 'align'; readonly alignment: Expression; readonly span: SourceSpan }
  | { readonly kind: 'end'; readonly span: SourceSpan }
  | { readonly kind: 'binfrom'; readonly expression: Expression; readonly span: SourceSpan }
  | { readonly kind: 'binto'; readonly expression: Expression; readonly span: SourceSpan }
  | {
      readonly kind: 'enum';
      readonly name: string;
      readonly members: readonly string[];
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'type';
      readonly name: string;
      readonly layoutKind: 'record' | 'union';
      readonly fields: readonly LayoutField[];
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'string-data';
      readonly directive: 'cstr' | 'pstr' | 'istr';
      readonly value: string;
      readonly span: SourceSpan;
    }
  | { readonly kind: 'instruction'; readonly instruction: Instruction; readonly span: SourceSpan };

export type Instruction = Z80Instruction;

export type DataValue = Expression | { readonly kind: 'string-fragment'; readonly value: string };

export interface LayoutField {
  readonly name: string;
  readonly size: number;
  readonly typeExpr?: TypeExpr;
}
