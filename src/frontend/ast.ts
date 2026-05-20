/**
 * Frontend AST contracts for ZAX.
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
 * Parsed compilation unit, including the entry file and all loaded module files.
 */
export interface ProgramNode extends BaseNode {
  kind: 'Program';
  entryFile: string;
  files: ModuleFileNode[];
}

/**
 * A single `.zax` module file.
 */
export interface ModuleFileNode extends BaseNode {
  kind: 'ModuleFile';
  path: string;
  moduleId: string;
  items: ModuleItemNode[];
}

/**
 * A classic ASM80 source file parsed into source-ordered top-level assembler items.
 */
export interface ClassicModuleFileNode extends BaseNode {
  kind: 'ClassicModuleFile';
  path: string;
  items: ClassicItemNode[];
}

export type ClassicItemNode =
  | ClassicEquNode
  | ClassicOrgNode
  | ClassicBinFromNode
  | ClassicBinToNode
  | ClassicEndNode
  | AsmLabelNode
  | (AsmInstructionNode & { operandText?: string })
  | (RawDataDeclNode & { valuesText?: string });

export interface ClassicEquNode extends BaseNode {
  kind: 'ClassicEqu';
  name: string;
  exprText: string;
}

export interface ClassicOrgNode extends BaseNode {
  kind: 'ClassicOrg';
  exprText: string;
}

export interface ClassicBinFromNode extends BaseNode {
  kind: 'ClassicBinFrom';
  exprText: string;
}

export interface ClassicBinToNode extends BaseNode {
  kind: 'ClassicBinTo';
  exprText: string;
}

export interface ClassicEndNode extends BaseNode {
  kind: 'ClassicEnd';
}

/**
 * Neutral assembler directive aliases.
 *
 * The current AST still uses the established `Classic*` node kinds for parser
 * and lowering compatibility. Native AZM should prefer these aliases at type
 * boundaries so new assembler-facing code does not describe core AZM
 * directives as merely "classic" compatibility artifacts.
 */
export type AsmEquDirectiveNode = ClassicEquNode;
export type AsmOrgDirectiveNode = ClassicOrgNode;
export type AsmBinFromDirectiveNode = ClassicBinFromNode;
export type AsmBinToDirectiveNode = ClassicBinToNode;
export type AsmEndDirectiveNode = ClassicEndNode;

/**
 * Top-level items permitted in a module file.
 */
export type ModuleItemNode =
  | ImportNode
  | ClassicItemNode
  | ConstDeclNode
  | EnumDeclNode
  | VarBlockNode
  | FuncDeclNode
  | UnionDeclNode
  | TypeDeclNode
  | ExternDeclNode
  | BinDeclNode
  | HexDeclNode
  | OpDeclNode
  | AlignDirectiveNode
  | AsmLabelNode
  | AsmInstructionNode
  | AsmControlNode
  | UnimplementedNode;

/**
 * Placeholder node used by contracts to reserve future space in unions.
 *
 * Parsers should not emit this node for constructs that are already implemented.
 */
export interface UnimplementedNode extends BaseNode {
  kind: 'Unimplemented';
  note: string;
}

/**
 * Import statement.
 */
export interface ImportNode extends BaseNode {
  kind: 'Import';
  specifier: string;
  form: 'moduleId' | 'path';
}

/**
 * Alignment directive.
 */
export interface AlignDirectiveNode extends BaseNode {
  kind: 'Align';
  value: ImmExprNode;
}

/**
 * Type alias declaration.
 */
export interface TypeDeclNode extends BaseNode {
  kind: 'TypeDecl';
  name: string;
  exported: boolean;
  typeExpr: TypeExprNode;
}

/**
 * Union declaration.
 */
export interface UnionDeclNode extends BaseNode {
  kind: 'UnionDecl';
  name: string;
  exported: boolean;
  fields: RecordFieldNode[];
}

/**
 * Enum declaration.
 */
export interface EnumDeclNode extends BaseNode {
  kind: 'EnumDecl';
  name: string;
  exported: boolean;
  members: string[];
}

/**
 * Constant declaration.
 */
export interface ConstDeclNode extends BaseNode {
  kind: 'ConstDecl';
  name: string;
  exported: boolean;
  value: ImmExprNode;
}

/**
 * Variable storage block at module (`globals`) or function (`var`) scope.
 */
export interface VarBlockNode extends BaseNode {
  kind: 'VarBlock';
  scope: 'module' | 'function';
  decls: VarDeclNode[];
}

/**
 * Single variable declaration inside a `var` block.
 */
export type VarDeclNode = VarDeclTypedNode | VarDeclAliasNode;

export interface VarDeclTypedNode extends BaseNode {
  kind: 'VarDecl';
  form: 'typed';
  name: string;
  typeExpr: TypeExprNode;
  initializer?: VarDeclValueInitializerNode;
}

export interface VarDeclAliasNode extends BaseNode {
  kind: 'VarDecl';
  form: 'alias';
  name: string;
  initializer: VarDeclAliasInitializerNode;
}

export type VarDeclInitializerNode = VarDeclValueInitializerNode | VarDeclAliasInitializerNode;

export type VarDeclValueInitializerNode = {
  kind: 'VarInitValue';
  span: SourceSpan;
  expr: ImmExprNode;
};
export type VarDeclAliasInitializerNode = {
  kind: 'VarInitAlias';
  span: SourceSpan;
  expr: EaExprNode;
};

/**
 * Raw data declaration emitted by assembler data directives.
 */
export type RawDataDeclNode =
  | {
      kind: 'RawDataDecl';
      span: SourceSpan;
      name: string;
      directive: 'db' | 'dw';
      values: ImmExprNode[];
      valuesText?: string;
    }
  | {
      kind: 'RawDataDecl';
      span: SourceSpan;
      name: string;
      directive: 'ds';
      size: ImmExprNode;
      fill?: ImmExprNode;
    };

/**
 * `bin` declaration: include raw bytes from an external file into a section.
 */
export interface BinDeclNode extends BaseNode {
  kind: 'BinDecl';
  name: string;
  section: 'code' | 'data' | 'var';
  fromPath: string;
}

/**
 * `hex` declaration: include bytes from an Intel HEX file.
 */
export interface HexDeclNode extends BaseNode {
  kind: 'HexDecl';
  name: string;
  fromPath: string;
}

/**
 * `extern` declaration block.
 */
export interface ExternDeclNode extends BaseNode {
  kind: 'ExternDecl';
  base?: string;
  funcs: ExternFuncNode[];
}

/**
 * Extern function binding.
 */
export interface ExternFuncNode extends BaseNode {
  kind: 'ExternFunc';
  name: string;
  params: ParamNode[];
  returnRegs?: string[]; // register list; empty/undefined means no register returns
  at: ImmExprNode;
}

/**
 * Function declaration.
 */
export interface FuncDeclNode extends BaseNode {
  kind: 'FuncDecl';
  name: string;
  exported: boolean;
  params: ParamNode[];
  returnRegs: string[];
  locals: VarBlockNode;
  asm: AsmBlockNode;
}

/**
 * `op` (macro-instruction) declaration.
 */
export interface OpDeclNode extends BaseNode {
  kind: 'OpDecl';
  name: string;
  exported: boolean;
  params: OpParamNode[];
  body: AsmBlockNode;
}

/**
 * Typed function parameter.
 */
export interface ParamNode extends BaseNode {
  kind: 'Param';
  name: string;
  typeExpr: TypeExprNode;
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
 * `asm` block inside a function or `op` body.
 */
export interface AsmBlockNode extends BaseNode {
  kind: 'AsmBlock';
  items: AsmItemNode[];
}

/**
 * Items that can appear inside an `asm` block.
 */
export type AsmItemNode = AsmInstructionNode | AsmControlNode | AsmLabelNode | UnimplementedNode;

/**
 * Label definition inside an `asm` stream.
 */
export interface AsmLabelNode extends BaseNode {
  kind: 'AsmLabel';
  name: string;
  /** True when the source label used the ASM80-compatible `@Name:` entry marker. */
  isEntry?: boolean;
}

/**
 * Z80 instruction-like statement inside an `asm` stream.
 */
export interface AsmInstructionNode extends BaseNode {
  kind: 'AsmInstruction';
  /** Canonical lower-case instruction mnemonic or a built-in symbolic head like ":=". */
  head: string;
  operands: AsmOperandNode[];
  /** Original unparsed operand tail for classic ASM80 source preservation. */
  operandText?: string;
}

/**
 * Structured control-flow keywords inside an `asm` stream.
 *
 * Condition-code fields (`cc`) are canonical lower-case tokens.
 */
export type AsmControlNode =
  | { kind: 'If'; span: SourceSpan; cc: string }
  | { kind: 'Else'; span: SourceSpan }
  | { kind: 'End'; span: SourceSpan }
  | { kind: 'While'; span: SourceSpan; cc: string }
  | { kind: 'Repeat'; span: SourceSpan }
  | { kind: 'Until'; span: SourceSpan; cc: string }
  | { kind: 'Break'; span: SourceSpan }
  | { kind: 'Continue'; span: SourceSpan }
  | { kind: 'Select'; span: SourceSpan; selector: AsmOperandNode }
  | { kind: 'Case'; span: SourceSpan; value: ImmExprNode; end?: ImmExprNode }
  | { kind: 'SelectElse'; span: SourceSpan };

/**
 * Operand variants in `asm` instructions.
 */
export type AsmOperandNode =
  | { kind: 'Reg'; span: SourceSpan; /** Canonical upper-case register token. */ name: string }
  | { kind: 'Imm'; span: SourceSpan; expr: ImmExprNode }
  | { kind: 'Ea'; span: SourceSpan; expr: EaExprNode; explicitAddressOf?: boolean }
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
  | { kind: 'ImmOffsetof'; span: SourceSpan; typeExpr: TypeExprNode; path: OffsetofPathNode }
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
  | { kind: 'EaReinterpret'; span: SourceSpan; typeExpr: TypeExprNode; base: EaExprNode }
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
export interface OffsetofPathNode extends BaseNode {
  kind: 'OffsetofPath';
  base?: string;
  steps: OffsetofPathStepNode[];
}

export type OffsetofPathStepNode =
  | { kind: 'OffsetofField'; span: SourceSpan; name: string }
  | { kind: 'OffsetofIndex'; span: SourceSpan; expr: ImmExprNode };

/**
 * Union of all AST node types.
 */
export type Node =
  | ProgramNode
  | ModuleFileNode
  | ClassicModuleFileNode
  | ClassicItemNode
  | ModuleItemNode
  | RawDataDeclNode
  | VarDeclNode
  | ParamNode
  | OpParamNode
  | RecordFieldNode
  | AsmBlockNode
  | AsmItemNode
  | AsmControlNode
  | AsmOperandNode
  | TypeExprNode
  | ImmExprNode
  | EaExprNode
  | EaIndexNode
  | OffsetofPathNode
  | OffsetofPathStepNode
  | VarDeclInitializerNode
  | OpMatcherNode;
