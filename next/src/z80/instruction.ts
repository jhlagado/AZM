import type { Expression } from '../model/expression.js';

export type Z80Condition = 'nz' | 'z' | 'nc' | 'c';

export type Z80Instruction =
  | { readonly mnemonic: 'nop' }
  | { readonly mnemonic: 'ret' }
  | { readonly mnemonic: 'ld-a-imm'; readonly expression: Expression }
  | { readonly mnemonic: 'jp'; readonly expression: Expression }
  | { readonly mnemonic: 'call'; readonly expression: Expression }
  | { readonly mnemonic: 'jr'; readonly expression: Expression }
  | {
      readonly mnemonic: 'jr-cc';
      readonly condition: Z80Condition;
      readonly expression: Expression;
    }
  | { readonly mnemonic: 'djnz'; readonly expression: Expression };

export type EncodedZ80Fragment =
  | { readonly kind: 'bytes'; readonly bytes: readonly number[] }
  | { readonly kind: 'imm8'; readonly expression: Expression }
  | { readonly kind: 'abs16'; readonly expression: Expression }
  | { readonly kind: 'rel8'; readonly expression: Expression; readonly mnemonic: string };

export interface EncodedZ80Instruction {
  readonly size: number;
  readonly fragments: readonly EncodedZ80Fragment[];
}
