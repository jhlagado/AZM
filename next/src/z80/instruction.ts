import type { Expression } from '../model/expression.js';

export type Z80RelativeCondition = 'nz' | 'z' | 'nc' | 'c';
export type Z80Condition = Z80RelativeCondition | 'po' | 'pe' | 'p' | 'm';
export type Z80AluMnemonic = 'add' | 'adc' | 'sub' | 'sbc' | 'and' | 'or' | 'xor' | 'cp';
export type Z80CoreMnemonic =
  | 'di'
  | 'ei'
  | 'scf'
  | 'ccf'
  | 'cpl'
  | 'exx'
  | 'halt'
  | 'reti'
  | 'retn';
export type Z80HlAluMnemonic = 'add' | 'adc' | 'sbc';
export type Z80BitMnemonic = 'bit' | 'res' | 'set';
export type Z80RotateShiftMnemonic =
  | 'rlc'
  | 'rrc'
  | 'rl'
  | 'rr'
  | 'sla'
  | 'sra'
  | 'sll'
  | 'sls'
  | 'srl';
export type Z80Register8 = 'a' | 'b' | 'c' | 'd' | 'e' | 'h' | 'l';
export type Z80Register16 = 'bc' | 'de' | 'hl' | 'sp';
export type Z80IndexRegister16 = 'ix' | 'iy';
export type Z80IndexHalfRegister = 'ixh' | 'ixl' | 'iyh' | 'iyl';
export type Z80SpecialRegister8 = 'i' | 'r';
export type Z80StackRegister16 = 'bc' | 'de' | 'hl' | 'af' | 'ix' | 'iy';
export type Z80RegisterIndirect = 'bc' | 'de' | 'hl';
export type Z80JumpIndirectRegister = 'hl' | 'ix' | 'iy';
export type Z80RstVector = 0 | 8 | 16 | 24 | 32 | 40 | 48 | 56;

export type Z80Operand =
  | { readonly kind: 'reg8'; readonly register: Z80Register8 }
  | { readonly kind: 'reg16'; readonly register: Z80Register16 }
  | { readonly kind: 'reg-index16'; readonly register: Z80IndexRegister16 }
  | { readonly kind: 'reg-half-index'; readonly register: Z80IndexHalfRegister }
  | { readonly kind: 'special8'; readonly register: Z80SpecialRegister8 }
  | { readonly kind: 'reg-indirect'; readonly register: Z80RegisterIndirect }
  | { readonly kind: 'mem-abs'; readonly expression: Expression }
  | {
      readonly kind: 'indexed';
      readonly register: Z80IndexRegister16;
      readonly displacement: Expression;
    }
  | { readonly kind: 'imm'; readonly expression: Expression };

export type Z80Instruction =
  | { readonly mnemonic: 'nop' }
  | { readonly mnemonic: 'ret' }
  | { readonly mnemonic: 'ret-cc'; readonly condition: Z80Condition }
  | { readonly mnemonic: Z80CoreMnemonic }
  | { readonly mnemonic: 'ex'; readonly form: 'de-hl' | 'sp-hl' }
  | { readonly mnemonic: 'im'; readonly mode: 0 | 1 | 2 }
  | { readonly mnemonic: 'rst'; readonly vector: Z80RstVector }
  | {
      readonly mnemonic: 'inc' | 'dec';
      readonly operand:
        | { readonly kind: 'reg8'; readonly register: Z80Register8 }
        | { readonly kind: 'reg16'; readonly register: Z80Register16 | Z80IndexRegister16 }
        | { readonly kind: 'reg-half-index'; readonly register: Z80IndexHalfRegister }
        | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
        | {
            readonly kind: 'indexed';
            readonly register: Z80IndexRegister16;
            readonly displacement: Expression;
          };
    }
  | { readonly mnemonic: 'push' | 'pop'; readonly register: Z80StackRegister16 }
  | { readonly mnemonic: 'ld-a-imm'; readonly expression: Expression }
  | { readonly mnemonic: 'ld'; readonly target: Z80Operand; readonly source: Z80Operand }
  | {
      readonly mnemonic: Z80BitMnemonic;
      readonly bit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
      readonly operand:
        | { readonly kind: 'reg8'; readonly register: Z80Register8 }
        | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
        | {
            readonly kind: 'indexed';
            readonly register: Z80IndexRegister16;
            readonly displacement: Expression;
          };
      readonly destination?: { readonly kind: 'reg8'; readonly register: Z80Register8 };
    }
  | {
      readonly mnemonic: Z80RotateShiftMnemonic;
      readonly operand:
        | { readonly kind: 'reg8'; readonly register: Z80Register8 }
        | { readonly kind: 'reg-indirect'; readonly register: 'hl' }
        | {
            readonly kind: 'indexed';
            readonly register: Z80IndexRegister16;
            readonly displacement: Expression;
          };
      readonly destination?: { readonly kind: 'reg8'; readonly register: Z80Register8 };
    }
  | { readonly mnemonic: Z80AluMnemonic; readonly source: Z80Operand }
  | {
      readonly mnemonic: Z80HlAluMnemonic;
      readonly target: Extract<Z80Operand, { readonly kind: 'reg16' }>;
      readonly source: Extract<Z80Operand, { readonly kind: 'reg16' }>;
    }
  | { readonly mnemonic: 'jp'; readonly expression: Expression }
  | {
      readonly mnemonic: 'jp-cc';
      readonly condition: Z80Condition;
      readonly expression: Expression;
    }
  | { readonly mnemonic: 'jp-indirect'; readonly register: Z80JumpIndirectRegister }
  | { readonly mnemonic: 'call'; readonly expression: Expression }
  | {
      readonly mnemonic: 'call-cc';
      readonly condition: Z80Condition;
      readonly expression: Expression;
    }
  | { readonly mnemonic: 'jr'; readonly expression: Expression }
  | {
      readonly mnemonic: 'jr-cc';
      readonly condition: Z80RelativeCondition;
      readonly expression: Expression;
    }
  | { readonly mnemonic: 'djnz'; readonly expression: Expression };

export type EncodedZ80Fragment =
  | { readonly kind: 'bytes'; readonly bytes: readonly number[] }
  | { readonly kind: 'imm8'; readonly expression: Expression }
  | { readonly kind: 'disp8'; readonly expression: Expression }
  | { readonly kind: 'abs16'; readonly expression: Expression }
  | { readonly kind: 'rel8'; readonly expression: Expression; readonly mnemonic: string };

export interface EncodedZ80Instruction {
  readonly size: number;
  readonly fragments: readonly EncodedZ80Fragment[];
}
