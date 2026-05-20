export const TOP_LEVEL_KEYWORD_LIST = [
  'enum',
  'type',
  'union',
  'op',
  'align',
] as const;

export const TOP_LEVEL_KEYWORDS = new Set<string>(TOP_LEVEL_KEYWORD_LIST);

function escapeRegexAtom(atom: string): string {
  return atom.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export function regexAlternation(items: readonly string[]): string {
  return items.map((item) => escapeRegexAtom(item)).join('|');
}

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
export const LAYOUT_CAST_BASE_REGISTER_LIST = ['HL', 'DE', 'BC', 'IX', 'IY'] as const;
export const LAYOUT_CAST_BASE_REGISTERS = new Set<string>(LAYOUT_CAST_BASE_REGISTER_LIST);

export const CONDITION_CODE_LIST = ['z', 'nz', 'c', 'nc', 'pe', 'po', 'm', 'p'] as const;
export const CONDITION_CODES = new Set<string>(CONDITION_CODE_LIST);

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
