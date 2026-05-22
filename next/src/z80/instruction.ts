import type { Expression } from '../model/expression.js';

export type Z80Condition = 'nz' | 'z' | 'nc' | 'c';
export type Z80AluMnemonic = 'add' | 'adc' | 'sub' | 'sbc' | 'and' | 'or' | 'xor' | 'cp';
export type Z80HlAluMnemonic = 'add' | 'adc' | 'sbc';
export type Z80Register8 = 'a' | 'b' | 'c' | 'd' | 'e' | 'h' | 'l';
export type Z80Register16 = 'bc' | 'de' | 'hl' | 'sp';
export type Z80RegisterIndirect = 'bc' | 'de' | 'hl';

export type Z80Operand =
  | { readonly kind: 'reg8'; readonly register: Z80Register8 }
  | { readonly kind: 'reg16'; readonly register: Z80Register16 }
  | { readonly kind: 'reg-indirect'; readonly register: Z80RegisterIndirect }
  | { readonly kind: 'imm'; readonly expression: Expression };

export type Z80Instruction =
  | { readonly mnemonic: 'nop' }
  | { readonly mnemonic: 'ret' }
  | { readonly mnemonic: 'ld-a-imm'; readonly expression: Expression }
  | { readonly mnemonic: 'ld'; readonly target: Z80Operand; readonly source: Z80Operand }
  | { readonly mnemonic: Z80AluMnemonic; readonly source: Z80Operand }
  | {
      readonly mnemonic: Z80HlAluMnemonic;
      readonly target: Extract<Z80Operand, { readonly kind: 'reg16' }>;
      readonly source: Extract<Z80Operand, { readonly kind: 'reg16' }>;
    }
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
