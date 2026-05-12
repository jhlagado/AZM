export const TOP_LEVEL_KEYWORD_LIST = [
  'func',
  'const',
  'enum',
  'data',
  'import',
  'type',
  'union',
  'globals',
  'var',
  'extern',
  'bin',
  'hex',
  'op',
  'section',
  'align',
] as const;

export const TOP_LEVEL_KEYWORDS = new Set<string>(TOP_LEVEL_KEYWORD_LIST);

export const NAMED_SECTION_KIND_LIST = ['code', 'data'] as const;
export const NAMED_SECTION_KINDS = new Set<string>(NAMED_SECTION_KIND_LIST);
export const LEGACY_SECTION_DIRECTIVE_KIND_LIST = [...NAMED_SECTION_KIND_LIST, 'var'] as const;
export const LEGACY_SECTION_DIRECTIVE_KINDS = new Set<string>(LEGACY_SECTION_DIRECTIVE_KIND_LIST);

function escapeRegexAtom(atom: string): string {
  return atom.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export function regexAlternation(items: readonly string[]): string {
  return items.map((item) => escapeRegexAtom(item)).join('|');
}

export const NAMED_SECTION_KIND_PATTERN = regexAlternation(NAMED_SECTION_KIND_LIST);
export const LEGACY_SECTION_DIRECTIVE_KIND_PATTERN = regexAlternation(
  LEGACY_SECTION_DIRECTIVE_KIND_LIST,
);

export const REGISTERS_8 = ['A', 'B', 'C', 'D', 'E', 'H', 'L'] as const;
export const REGISTERS_8_EXTENDED = ['IXH', 'IXL', 'IYH', 'IYL', 'I', 'R'] as const;
export const REGISTERS_16_GENERAL = ['HL', 'DE', 'BC', 'SP', 'IX', 'IY'] as const;
export const REGISTERS_16_SPECIAL = ['AF'] as const;
export const REGISTERS_16 = [...REGISTERS_16_GENERAL, ...REGISTERS_16_SPECIAL] as const;
export const REGISTERS_16_SHADOW = ["AF'"] as const;
export const ALL_REGISTER_NAME_LIST = [
  ...REGISTERS_8,
  ...REGISTERS_8_EXTENDED,
  ...REGISTERS_16,
  ...REGISTERS_16_SHADOW,
] as const;
export const ALL_REGISTER_NAMES = new Set<string>(ALL_REGISTER_NAME_LIST);
export const INDEX_REG8_NAMES = new Set<string>(REGISTERS_8);
export const INDEX_REG16_LIST = ['HL', 'DE', 'BC'] as const;
export const INDEX_REG16_NAMES = new Set<string>(INDEX_REG16_LIST);
export const INDEX_MEM_BASE_REGISTER_LIST = ['IX', 'IY'] as const;
export const INDEX_MEM_BASE_REGISTERS = new Set<string>(INDEX_MEM_BASE_REGISTER_LIST);
export const TYPED_REINTERPRET_BASE_REGISTER_LIST = ['HL', 'DE', 'BC', 'IX', 'IY'] as const;
export const TYPED_REINTERPRET_BASE_REGISTERS = new Set<string>(
  TYPED_REINTERPRET_BASE_REGISTER_LIST,
);
export const ASSIGNMENT_REGISTER_LIST = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  'BC',
  'DE',
  'HL',
  'IX',
  'IY',
] as const;
export const ASSIGNMENT_REGISTER_NAMES = new Set<string>(ASSIGNMENT_REGISTER_LIST);
export const MOVE_REGISTER_LIST = [
  ...REGISTERS_8,
  'HL',
  'DE',
  'BC',
  'SP',
  'IX',
  'IY',
  'AF',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
] as const;
export const MOVE_REGISTERS = new Set<string>(MOVE_REGISTER_LIST);
export const RETURN_REGISTER_LIST = ['HL', 'DE', 'BC', 'AF'] as const;
export const RETURN_REGISTERS = new Set<string>(RETURN_REGISTER_LIST);
export const LEGACY_RETURN_KEYWORD_LIST = [
  'VOID',
  'BYTE',
  'WORD',
  'LONG',
  'VERYLONG',
  'NONE',
  'FLAGS',
] as const;
export const LEGACY_RETURN_KEYWORDS = new Set<string>(LEGACY_RETURN_KEYWORD_LIST);

export const CONDITION_CODE_LIST = ['z', 'nz', 'c', 'nc', 'pe', 'po', 'm', 'p'] as const;
export const CONDITION_CODES = new Set<string>(CONDITION_CODE_LIST);

export const ASM_CONTROL_KEYWORD_LIST = [
  'if',
  'else',
  'end',
  'while',
  'repeat',
  'until',
  'break',
  'continue',
  'select',
  'case',
] as const;
export const ASM_CONTROL_KEYWORDS = new Set<string>(ASM_CONTROL_KEYWORD_LIST);

export const SCALAR_TYPE_LIST = ['byte', 'word', 'addr'] as const;
export const SCALAR_TYPES = new Set<string>(SCALAR_TYPE_LIST);

export const IMM_OPERATOR_PRECEDENCE = [
  { level: 7, ops: ['*', '/', '%'] as const },
  { level: 6, ops: ['+', '-'] as const },
  { level: 5, ops: ['<<', '>>'] as const },
  { level: 4, ops: ['&'] as const },
  { level: 3, ops: ['^'] as const },
  { level: 2, ops: ['|'] as const },
] as const;

export const IMM_BINARY_OPERATOR_PRECEDENCE = new Map<string, number>(
  IMM_OPERATOR_PRECEDENCE.flatMap(({ level, ops }) => ops.map((op) => [op, level] as const)),
);
export const IMM_BINARY_OPERATORS = new Set<string>(IMM_BINARY_OPERATOR_PRECEDENCE.keys());
export const IMM_UNARY_OPERATORS = ['+', '-', '~'] as const;
export const IMM_UNARY_OPERATOR_SET = new Set<string>(IMM_UNARY_OPERATORS);
export const IMM_MULTI_CHAR_OPERATORS = new Set<string>(['<<', '>>']);

export const CHAR_ESCAPE_VALUES = new Map<string, number>([
  ['n', 10],
  ['r', 13],
  ['t', 9],
  ['0', 0],
  ['\\', 92],
  ["'", 39],
  ['"', 34],
]);

export const MATCHER_TYPE_LIST = [
  'reg8',
  'reg16',
  'idx16',
  'cc',
  'imm8',
  'imm16',
  'ea',
  'mem8',
  'mem16',
] as const;
export const MATCHER_TYPES = new Set<string>(MATCHER_TYPE_LIST);
export const MATCHER_KIND_BY_TYPE: Readonly<
  Record<
    (typeof MATCHER_TYPE_LIST)[number],
    | 'MatcherReg8'
    | 'MatcherReg16'
    | 'MatcherIdx16'
    | 'MatcherCc'
    | 'MatcherImm8'
    | 'MatcherImm16'
    | 'MatcherEa'
    | 'MatcherMem8'
    | 'MatcherMem16'
  >
> = {
  reg8: 'MatcherReg8',
  reg16: 'MatcherReg16',
  idx16: 'MatcherIdx16',
  cc: 'MatcherCc',
  imm8: 'MatcherImm8',
  imm16: 'MatcherImm16',
  ea: 'MatcherEa',
  mem8: 'MatcherMem8',
  mem16: 'MatcherMem16',
};
