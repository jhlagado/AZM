import type { SectionKind } from './loweringTypes.js';

export type LoweredAsmStream = {
  /** Ordered blocks as emitted during lowering (pre-placement). */
  blocks: LoweredAsmStreamBlock[];
};

export type LoweredAsmStreamBlock = {
  /** Base section chunk vs named contribution block. */
  kind: 'base' | 'named';
  /** Which logical section this block belongs to. */
  section: SectionKind;
  /** Named section name when `kind === 'named'`. */
  name?: string;
  /** Stable ordering among contributions to the same anchor. */
  contributionOrder?: number;
  /** Lowered items in emission order. */
  items: LoweredAsmItem[];
};

export type LoweredAsmProgram = {
  /** Blocks with assigned origins after placement. */
  blocks: LoweredAsmBlock[];
  /** Optional symbol table snapshot for listings. */
  symbols?: LoweredAsmSymbol[];
};

export type LoweredAsmBlock = {
  /** Section-relative block vs absolute-origin blob. */
  kind: 'section' | 'absolute';
  /** Base address for this block’s bytes. */
  origin: number;
  /** Section kind when `kind === 'section'`. */
  section?: SectionKind;
  /** Named section name when applicable. */
  name?: string;
  /** Contribution ordering within a named anchor. */
  contributionOrder?: number;
  /** Lowered items. */
  items: LoweredAsmItem[];
};

export type LoweredAsmSymbol =
  | {
      /** Compile-time named constant. */
      kind: 'constant';
      /** Constant identifier text. */
      name: string;
      /** Folded imm expression. */
      value: LoweredImmExpr;
    }
  | {
      /** Runtime label or storage symbol. */
      kind: 'label' | 'data' | 'var' | 'unknown';
      /** Symbol name. */
      name: string;
      /** Address expression (may reference other symbols). */
      address: LoweredImmExpr;
    };

export type LoweredAsmItem =
  | {
      kind: 'label';
      /** Label name for this position. */
      name: string;
    }
  | {
      kind: 'const';
      /** Const name. */
      name: string;
      /** Const value expression. */
      value: LoweredImmExpr;
    }
  | {
      kind: 'db';
      /** Byte values. */
      values: LoweredImmExpr[];
    }
  | {
      kind: 'dw';
      /** Word values. */
      values: LoweredImmExpr[];
    }
  | {
      kind: 'ds';
      /** Reserve size in bytes. */
      size: LoweredImmExpr;
      /** Optional fill byte; omit for undefined fill. */
      fill?: LoweredImmExpr;
    }
  | {
      kind: 'instr';
      /** Mnemonic head token. */
      head: string;
      /** Rendered operands. */
      operands: LoweredOperand[];
      /** Encoded bytes when available; omit before encoding. */
      bytes?: number[];
    }
  | {
      kind: 'comment';
      /** Comment text. */
      text: string;
      /** User source comment vs compiler-generated trace. */
      origin: 'user' | 'zax';
    };

export type LoweredOperand =
  | {
      kind: 'reg';
      /** Canonical register name. */
      name: string;
    }
  | {
      kind: 'imm';
      /** Immediate subexpression. */
      expr: LoweredImmExpr;
    }
  | {
      kind: 'mem';
      /** Memory EA expression. */
      expr: LoweredEaExpr;
    }
  | {
      kind: 'ea';
      /** Standalone EA operand. */
      expr: LoweredEaExpr;
    }
  | {
      kind: 'portImm8';
      /** 8-bit port immediate. */
      expr: LoweredImmExpr;
    }
  | {
      /** `(C)` port form. */
      kind: 'portC';
    };

export type LoweredImmExpr =
  | {
      kind: 'literal';
      /** Numeric literal value. */
      value: number;
    }
  | {
      kind: 'symbol';
      /** Symbol name (may be address-bearing). */
      name: string;
      /** Byte offset added to the symbol’s value. */
      addend: number;
    }
  | {
      kind: 'unary';
      /** Unary operator. */
      op: '+' | '-' | '~';
      /** Inner expression. */
      expr: LoweredImmExpr;
    }
  | {
      kind: 'binary';
      /** Binary operator. */
      op: '*' | '/' | '%' | '+' | '-' | '&' | '^' | '|' | '<<' | '>>';
      /** Left operand. */
      left: LoweredImmExpr;
      /** Right operand. */
      right: LoweredImmExpr;
    }
  | {
      kind: 'opaque';
      /** Unparsed / passthrough text for listing. */
      text: string;
    };

export type LoweredEaExpr =
  | {
      kind: 'name';
      /** Identifier in an EA. */
      name: string;
    }
  | {
      kind: 'imm';
      /** Nested immediate. */
      expr: LoweredImmExpr;
    }
  | {
      kind: 'reinterpret';
      /** Target type name for reinterpret. */
      typeName: string;
      /** Base EA. */
      base: LoweredEaExpr;
    }
  | {
      kind: 'field';
      /** Record/union base. */
      base: LoweredEaExpr;
      /** Field name. */
      field: string;
    }
  | {
      kind: 'index';
      /** Array base. */
      base: LoweredEaExpr;
      /** Index selector. */
      index: LoweredIndexExpr;
    }
  | {
      kind: 'add';
      /** Base EA. */
      base: LoweredEaExpr;
      /** Positive offset imm. */
      offset: LoweredImmExpr;
    }
  | {
      kind: 'sub';
      /** Base EA. */
      base: LoweredEaExpr;
      /** Subtracted offset imm. */
      offset: LoweredImmExpr;
    };

export type LoweredIndexExpr =
  | {
      kind: 'imm';
      /** Constant index expression. */
      value: LoweredImmExpr;
    }
  | {
      kind: 'reg8';
      /** 8-bit index register name. */
      reg: string;
    }
  | {
      kind: 'reg16';
      /** 16-bit index register name. */
      reg: string;
    }
  | {
      /** `(HL)` addressing form. */
      kind: 'memHL';
    }
  | {
      kind: 'memIxIy';
      /** Which index register. */
      base: 'IX' | 'IY';
      /** Displacement; omit for 0. */
      disp?: LoweredImmExpr;
    }
  | {
      kind: 'ea';
      /** General EA used as index. */
      expr: LoweredEaExpr;
    };
