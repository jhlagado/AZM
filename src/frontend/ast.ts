/**
 * Frontend AST contracts for AZM.
 *
 * This module intentionally defines types/interfaces only (no parsing/semantics).
 * Later PRs extend these contracts via coordinated changes.
 */
export interface SourcePosition {
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** 0-based byte offset in the file. */
  offset: number;
}

/**
 * Source span with inclusive start and end positions.
 */
export interface SourceSpan {
  /** User-facing file path (as provided on input). */
  file: string;
  start: SourcePosition;
  end: SourcePosition;
}

/**
 * Base shape for all AST nodes.
 */
export interface BaseNode {
  kind: string;
  span: SourceSpan;
}

/**
 * Parsed compilation unit, including the entry file and all loaded source files.
 */
export interface ProgramNode extends BaseNode {
  kind: 'Program';
  entryFile: string;
  files: SourceFileNode[];
}

/**
 * A single AZM source file.
 */
export interface SourceFileNode extends BaseNode {
  kind: 'SourceFile';
  path: string;
  items: SourceItemNode[];
}

interface AsmEquNode extends BaseNode {
  kind: 'AsmEqu';
  name: string;
  exprText: string;
}

interface AsmOrgNode extends BaseNode {
  kind: 'AsmOrg';
  exprText: string;
}

interface AsmBinFromNode extends BaseNode {
  kind: 'AsmBinFrom';
  exprText: string;
}

interface AsmBinToNode extends BaseNode {
  kind: 'AsmBinTo';
  exprText: string;
}

interface AsmEndNode extends BaseNode {
  kind: 'AsmEnd';
}

interface AsmAlignNode extends BaseNode {
  kind: 'AsmAlign';
  value: ImmExprNode;
}

type AsmRawDataValueNode = ImmExprNode | { kind: 'AsmString'; value: string };

export type AsmRawDataNode =
  | {
      kind: 'AsmRawData';
      span: SourceSpan;
      name?: string;
      directive: 'db' | 'dw' | 'cstr' | 'pstr' | 'istr';
      values: AsmRawDataValueNode[];
      valuesText?: string;
    }
  | {
      kind: 'AsmRawData';
      span: SourceSpan;
      name?: string;
      directive: 'ds';
      values?: AsmRawDataValueNode[];
      size?: ImmExprNode;
      fill?: ImmExprNode;
      valuesText?: string;
    };

/**
 * Top-level items permitted in a source file.
 */
export type SourceItemNode =
  | AsmEquNode
  | AsmOrgNode
  | AsmBinFromNode
  | AsmBinToNode
  | AsmEndNode
  | AsmAlignNode
  | AsmRawDataNode
  | AsmLabelNode
  | AsmInstructionNode
  | EnumDeclNode
  | UnionDeclNode
  | TypeDeclNode
  | OpDeclNode;

/**
 * Type alias declaration.
 */
export interface TypeDeclNode extends BaseNode {
  kind: 'TypeDecl';
  name: string;
  typeExpr: TypeExprNode;
}

/**
 * Union declaration.
 */
export interface UnionDeclNode extends BaseNode {
  kind: 'UnionDecl';
  name: string;
  fields: RecordFieldNode[];
}

/**
 * Enum declaration.
 */
export interface EnumDeclNode extends BaseNode {
  kind: 'EnumDecl';
  name: string;
  members: string[];
}

/**
 * `op` (macro-instruction) declaration.
 */
export interface OpDeclNode extends BaseNode {
  kind: 'OpDecl';
  name: string;
  params: OpParamNode[];
  body: AsmBlockNode;
}

/**
 * `op` parameter with a matcher type.
 */
export interface OpParamNode extends BaseNode {
  kind: 'OpParam';
  name: string;
  matcher: OpMatcherNode;
}

/**
 * Operand matcher variants for `op` parameters.
 */
export type OpMatcherNode =
  | { kind: 'MatcherReg8'; span: SourceSpan }
  | { kind: 'MatcherReg16'; span: SourceSpan }
  | { kind: 'MatcherIdx16'; span: SourceSpan }
  | { kind: 'MatcherCc'; span: SourceSpan }
  | { kind: 'MatcherImm8'; span: SourceSpan }
  | { kind: 'MatcherImm16'; span: SourceSpan }
  | { kind: 'MatcherEa'; span: SourceSpan }
  | { kind: 'MatcherMem8'; span: SourceSpan }
  | { kind: 'MatcherMem16'; span: SourceSpan }
  | { kind: 'MatcherFixed'; span: SourceSpan; token: string };

/**
 * Instruction stream inside ASM source or an `op` body.
 */
export interface AsmBlockNode extends BaseNode {
  kind: 'AsmBlock';
  items: AsmItemNode[];
}

/**
 * Items that can appear inside an instruction stream.
 */
export type AsmItemNode = AsmInstructionNode | AsmLabelNode;

/**
 * Label definition inside an `asm` stream.
 */
export interface AsmLabelNode extends BaseNode {
  kind: 'AsmLabel';
  name: string;
  /** True when the source label used the ASM80-style `@Name:` entry marker. */
  isEntry?: boolean;
}

/**
 * Z80 instruction-like statement inside an `asm` stream.
 */
export interface AsmInstructionNode extends BaseNode {
  kind: 'AsmInstruction';
  /** Canonical lower-case instruction mnemonic. */
  head: string;
  operands: AsmOperandNode[];
  /** Original unparsed operand tail for ASM80 source preservation. */
  operandText?: string;
}

/**
 * Operand variants in `asm` instructions.
 */
export type AsmOperandNode =
  | { kind: 'Reg'; span: SourceSpan; /** Canonical upper-case register token. */ name: string }
  | { kind: 'Imm'; span: SourceSpan; expr: ImmExprNode }
  | { kind: 'Ea'; span: SourceSpan; expr: EaExprNode }
  | { kind: 'Mem'; span: SourceSpan; expr: EaExprNode }
  | { kind: 'PortC'; span: SourceSpan }
  | { kind: 'PortImm8'; span: SourceSpan; expr: ImmExprNode };

/**
 * Type expression variants.
 */
export type TypeExprNode =
  | { kind: 'TypeName'; span: SourceSpan; name: string }
  | { kind: 'AddrOfType'; span: SourceSpan; target: TypeExprNode }
  | { kind: 'ArrayType'; span: SourceSpan; element: TypeExprNode; length?: number }
  | { kind: 'RecordType'; span: SourceSpan; fields: RecordFieldNode[] };

/**
 * Field inside a record type.
 */
export interface RecordFieldNode extends BaseNode {
  kind: 'RecordField';
  name: string;
  typeExpr: TypeExprNode;
}

/**
 * Immediate-expression variants.
 */
export type ImmExprNode =
  | { kind: 'ImmLiteral'; span: SourceSpan; value: number }
  | { kind: 'ImmCurrentLocation'; span: SourceSpan }
  | { kind: 'ImmName'; span: SourceSpan; name: string }
  | { kind: 'ImmSizeof'; span: SourceSpan; typeExpr: TypeExprNode }
  | { kind: 'ImmOffset'; span: SourceSpan; typeExpr: TypeExprNode; path: OffsetPathNode }
  | { kind: 'ImmUnary'; span: SourceSpan; op: '+' | '-' | '~'; expr: ImmExprNode }
  | {
      kind: 'ImmBinary';
      span: SourceSpan;
      op: '*' | '/' | '%' | '+' | '-' | '&' | '^' | '|' | '<<' | '>>';
      left: ImmExprNode;
      right: ImmExprNode;
    };

/**
 * Effective-address expression variants.
 */
export type EaExprNode =
  | { kind: 'EaName'; span: SourceSpan; name: string }
  | { kind: 'EaImm'; span: SourceSpan; expr: ImmExprNode }
  | { kind: 'EaLayoutCast'; span: SourceSpan; typeExpr: TypeExprNode; base: EaExprNode }
  | { kind: 'EaField'; span: SourceSpan; base: EaExprNode; field: string }
  | { kind: 'EaIndex'; span: SourceSpan; base: EaExprNode; index: EaIndexNode }
  | { kind: 'EaAdd'; span: SourceSpan; base: EaExprNode; offset: ImmExprNode }
  | { kind: 'EaSub'; span: SourceSpan; base: EaExprNode; offset: ImmExprNode };

/**
 * Index expression variants for effective addresses.
 */
export type EaIndexNode =
  | { kind: 'IndexImm'; span: SourceSpan; value: ImmExprNode }
  | { kind: 'IndexReg8'; span: SourceSpan; /** Canonical upper-case reg8 token. */ reg: string }
  | { kind: 'IndexReg16'; span: SourceSpan; /** Canonical upper-case reg16 token. */ reg: string }
  | { kind: 'IndexMemHL'; span: SourceSpan }
  | {
      kind: 'IndexMemIxIy';
      span: SourceSpan;
      /** Canonical upper-case base register token. */
      base: 'IX' | 'IY';
      /** Optional displacement imm expression (signed). */
      disp?: ImmExprNode;
    }
  | { kind: 'IndexEa'; span: SourceSpan; expr: EaExprNode };

/**
 * Field path used by the `offset(Type, path)` built-in.
 */
export interface OffsetPathNode extends BaseNode {
  kind: 'OffsetPath';
  base?: string;
  steps: OffsetPathStepNode[];
}

export type OffsetPathStepNode =
  | { kind: 'OffsetField'; span: SourceSpan; name: string }
  | { kind: 'OffsetIndex'; span: SourceSpan; expr: ImmExprNode };
