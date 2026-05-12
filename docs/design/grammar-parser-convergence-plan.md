# Grammar-Parser Convergence Plan

## Context

ZAX has two parallel representations of its syntax:

1. **`docs/spec/zax-grammar.ebnf.md`** — a descriptive EBNF companion that documents what the grammar looks like.
2. **Hand-written recursive-descent parser** — spread across ~10 files in `src/frontend/`, containing the actual parsing logic.

These two representations are maintained independently. The grammar doc says "if this and the spec diverge, the spec wins," and the parser was built by reading the spec, not the grammar. As a result, grammar atoms (registers, condition codes, operator precedence, escape sequences, keywords, matcher types) are hardcoded as inline string literals, regex patterns, and switch arms scattered across the parser. There is no single source of truth shared between the documentation and the code.

**Goal:** Incrementally bring grammar and parser closer together until one is derived from the other. The end state is a shared `grammarData.ts` module that the parser consumes at runtime and from which the grammar documentation can be mechanically generated.

**Non-goal:** Replacing the hand-written parser with a parser generator. ZAX has a line-oriented two-layer architecture (line dispatch for module structure, character-level expression parsing within lines) that is a poor fit for traditional PEG/LALR tools. The hand-written parser is the right choice; it just needs to read its atoms from shared data instead of hardcoding them.

---

## Current State Audit

### Parser File Map

| File | Lines | Productions Covered |
|------|-------|-------------------|
| `parser.ts` | 655 | `module`, `module_item`, `named_section_decl`, `section_item` |
| `parseAsmStatements.ts` | 437 | `if_stmt`, `while_stmt`, `repeat_stmt`, `select_stmt`, `case_clause`, `else`, `end`, `until` |
| `parseOperands.ts` | 248 | `asm_operand`, `register`, `ea_expr`, `ea_index`, `z80_instruction` |
| `parseImm.ts` | 445 | `imm_expr` (all precedence levels), `imm_primary`, `int_dec`, `int_hex`, `int_bin`, `char_lit`, `type_expr` |
| `parseModuleCommon.ts` | 331 | `ret_regs`, `local_decl`, `field_decl`, keyword tables |
| `parseParams.ts` | 185 | `param_list`, `op_param_list`, `matcher_type` |
| `parseFunc.ts` | ~200 | `func_decl`, `local_var_block`, `instr_stream` |
| `parseOp.ts` | ~120 | `op_decl` |
| `parseTypes.ts` | ~150 | `type_decl`, `union_decl`, `field_block` |
| `parseTopLevelSimple.ts` | ~200 | `import_decl`, `const_decl`, `align_decl`, `bin_decl`, `hex_decl`, `section_directive` |
| `parseData.ts` | ~180 | `data_section_block`, `data_decl`, `data_init_expr`, `aggregate_init` |
| `parseEnum.ts` | ~60 | `enum_decl` |
| `parseExternBlock.ts` | ~150 | `extern_block` |
| `parseParserShared.ts` | 27 | `stripLineComment`, reserved-name check |
| `parseCallableHeader.ts` | ~80 | Shared header parsing for func/op/extern |

### Identified Duplication and Hardcoding

#### 1. Reserved Keywords — duplicated in 2 places

- `parseParserShared.ts` lines 1-17: `RESERVED_TOP_LEVEL_KEYWORDS` Set
- `parseModuleCommon.ts` lines 11-27: `TOP_LEVEL_KEYWORDS` Set

Both contain the identical 15 keywords. Changes to one must be manually mirrored to the other.

#### 2. Register Names — hardcoded in 3+ places

- `parseOperands.ts` line 176: inline regex
  ```
  /^(A|B|C|D|E|H|L|IXH|IXL|IYH|IYL|HL|DE|BC|SP|IX|IY|AF|AF'|I|R)$/i
  ```
- `parseModuleCommon.ts` line 166: return register set
  ```typescript
  const allowed = new Set(['AF', 'BC', 'DE', 'HL']);
  ```
- `z80/encode.ts`, `z80/encodeAlu.ts`, `z80/encodeBitOps.ts`, etc.: register encoding tables with their own hardcoded sets
- `parseEaIndexFromText` lines 81-86: reg8/reg16 checks inline

#### 3. Condition Codes — NOT validated at parse time

- `parseAsmStatements.ts` lines 210, 233, 272: regex `[A-Za-z][A-Za-z0-9]*` accepts **any** identifier as a condition code
- The valid set `z | nz | c | nc | pe | po | m | p` is documented in the grammar but never enforced at parse time
- Validation only happens downstream in code generation (if at all)

#### 4. Scalar Types — NOT validated at parse time

- `parseImm.ts` `parseTypeExprFromText`: accepts any identifier as a type name
- The valid scalar set `byte | word | addr` is in the grammar doc but the parser does not distinguish them from user-defined type names

#### 5. Operator Precedence — hardcoded switch statement

- `parseImm.ts` lines 253-274: `precedence()` function is a switch over operator strings returning magic numbers
- The operator set and precedence levels are not externalized as data

#### 6. Escape Sequences — hardcoded switch in tokenizer

- `parseImm.ts` lines 186-217: char literal escape handling is a 30-line switch statement
- The escape set `\n \r \t \0 \\ \' \" \xHH` is hardcoded inline
- Must stay synchronized with string literal parsing (which is done elsewhere)

#### 7. Matcher Types — hardcoded switch in parseParams.ts

- `parseParams.ts` lines 94-116: `parseOpMatcherFromText` is a switch over 9 matcher type strings
- The valid matcher set `reg8 | reg16 | idx16 | cc | imm8 | imm16 | ea | mem8 | mem16` is hardcoded

#### 8. `stripLineComment` — duplicated in multiple files

- `parseParserShared.ts` line 23: canonical export
- `parseFunc.ts` line 31: private copy
- `parser.ts` line 44: imports as `stripComment` from parseParserShared
- `parseOp.ts`, `parseTypes.ts`, `parseGlobals.ts`, `parseExternBlock.ts`, `parseData.ts`: each imports or re-implements

Some files import the shared version; others have private copies. The function is trivial (semicolon-delimited comment stripping) but the inconsistency is a maintenance hazard.

#### 9. Monolithic Dispatchers

- `parser.ts` `parseModuleItem` (lines 215-584): 370-line sequential keyword-dispatch chain with 13 `consumeTopKeyword` checks
- `parseAsmStatements.ts` `parseAsmStatement` (lines 113-436): 300+ line monolithic dispatcher handling 7 distinct structured-control productions plus the fallback to z80_instruction

---

## Convergence Plan

### Phase 1: Extract Shared Grammar Atoms into `grammarData.ts`

**New file:** `src/frontend/grammarData.ts`

This module exports plain data objects (no parsing logic) that describe grammar atoms. Every hardcoded set/regex/switch in the parser becomes a consumer of this data.

```typescript
// --- Registers ---
export const REGISTERS_8 = ['A', 'B', 'C', 'D', 'E', 'H', 'L'] as const;
export const REGISTERS_8_EXTENDED = ['IXH', 'IXL', 'IYH', 'IYL', 'I', 'R'] as const;
export const REGISTERS_16 = ['HL', 'DE', 'BC', 'SP', 'IX', 'IY', 'AF'] as const;
export const REGISTERS_16_SHADOW = ["AF'"] as const;
export const ALL_REGISTERS = [
  ...REGISTERS_8, ...REGISTERS_8_EXTENDED,
  ...REGISTERS_16, ...REGISTERS_16_SHADOW,
] as const;
export const RETURN_REGISTERS = ['HL', 'DE', 'BC', 'AF'] as const;

// --- Condition Codes ---
export const CONDITION_CODES = ['z', 'nz', 'c', 'nc', 'pe', 'po', 'm', 'p'] as const;

// --- Scalar Types ---
export const SCALAR_TYPES = ['byte', 'word', 'addr'] as const;

// --- Top-level Keywords ---
export const TOP_LEVEL_KEYWORDS = [
  'func', 'const', 'enum', 'data', 'import', 'type', 'union',
  'globals', 'var', 'extern', 'bin', 'hex', 'op', 'section', 'align',
] as const;

// --- Operator Precedence (highest first) ---
export const OPERATOR_PRECEDENCE: ReadonlyArray<{
  level: number;
  ops: readonly string[];
}> = [
  { level: 7, ops: ['*', '/', '%'] },
  { level: 6, ops: ['+', '-'] },
  { level: 5, ops: ['<<', '>>'] },
  { level: 4, ops: ['&'] },
  { level: 3, ops: ['^'] },
  { level: 2, ops: ['|'] },
];
export const UNARY_OPS = ['+', '-', '~'] as const;

// --- Escape Sequences ---
export const CHAR_ESCAPES: ReadonlyMap<string, number> = new Map([
  ['n', 10], ['r', 13], ['t', 9], ['0', 0],
  ['\\', 92], ["'", 39], ['"', 34],
]);
// \xHH handled separately as it requires two hex digits

// --- Op Matcher Types ---
export const MATCHER_TYPES = [
  'reg8', 'reg16', 'idx16', 'cc',
  'imm8', 'imm16', 'ea', 'mem8', 'mem16',
] as const;

// --- Structured Control Keywords (asm-level) ---
export const ASM_CONTROL_KEYWORDS = [
  'if', 'else', 'end', 'while', 'repeat', 'until', 'select', 'case',
] as const;
```

**Consumers to update:**

| Current Location | What Changes |
|---|---|
| `parseOperands.ts` line 176 | Replace inline regex with `ALL_REGISTERS` set lookup |
| `parseModuleCommon.ts` line 166 | Replace hardcoded `allowed` set with `RETURN_REGISTERS` |
| `parseAsmStatements.ts` lines 210, 233, 272 | Validate cc against `CONDITION_CODES` set |
| `parseImm.ts` lines 253-274 | Replace `precedence()` switch with `OPERATOR_PRECEDENCE` table lookup |
| `parseImm.ts` lines 186-217 | Replace escape switch with `CHAR_ESCAPES` map lookup |
| `parseParams.ts` lines 94-116 | Replace `parseOpMatcherFromText` switch with `MATCHER_TYPES` lookup |
| `parseParserShared.ts` lines 1-17 | Delete, import from `grammarData.ts` |
| `parseModuleCommon.ts` lines 11-27 | Delete, import from `grammarData.ts` |

**Files to modify:** 7 parser files + 1 new file.

**Critical file paths:**
- NEW: `src/frontend/grammarData.ts`
- `src/frontend/parseOperands.ts`
- `src/frontend/parseModuleCommon.ts`
- `src/frontend/parseAsmStatements.ts`
- `src/frontend/parseImm.ts`
- `src/frontend/parseParams.ts`
- `src/frontend/parseParserShared.ts`

### Phase 2: Parse-Time Validation of Condition Codes

Currently, `parseAsmStatement` accepts any single identifier token as a condition code for `if`, `while`, and `until`. The regex is:

```
/^if\s+([A-Za-z][A-Za-z0-9]*)$/i
```

This means `if foo` parses successfully and the invalid condition code only surfaces (maybe) during code generation.

**Change:** After extracting the cc token, validate it against `CONDITION_CODES` from `grammarData.ts`. If invalid, emit a diagnostic and use the `__missing__` sentinel (same recovery pattern already used for bare `if` without any token).

**Locations:**
- `parseAsmStatements.ts` line 212: if cc validation
- `parseAsmStatements.ts` line 235: while cc validation
- `parseAsmStatements.ts` line 274: until cc validation

**Impact:** Pure additive — no existing valid programs change. Invalid programs get earlier, clearer diagnostics.

### Phase 3: Deduplicate `stripLineComment`

Consolidate all comment-stripping to a single import from `parseParserShared.ts`:

- `parseFunc.ts` line 31-34: delete private `stripComment`, import from shared
- Verify `parseOp.ts`, `parseTypes.ts`, `parseGlobals.ts`, `parseExternBlock.ts`, `parseData.ts` all use the shared import
- Consider moving `stripLineComment` into `grammarData.ts` or keeping it in `parseParserShared.ts` (which becomes a thin re-export layer over grammarData)

**Files to modify:** 2-4 files (depending on how many have private copies).

### Phase 4: Align Parser Function Names with Grammar Productions

The parser function names don't match the grammar production names. This makes cross-referencing harder and obscures the structural correspondence. Rename to match:

| Current Function | Grammar Production | Proposed Name |
|---|---|---|
| `parseAsmStatement` | `instr_line` | `parseInstrLine` |
| `parseAsmInstruction` | `z80_instruction` | `parseZ80Instruction` |
| `parseAsmOperand` | `asm_operand` | `parseAsmOperand` *(keep)* |
| `parseEaExprFromText` | `ea_expr` | `parseEaExpr` |
| `parseEaIndexFromText` | `ea_index` | `parseEaIndex` |
| `parseImmExprFromText` | `imm_expr` | `parseImmExpr` |
| `parseModuleItem` | `module_item` | `parseModuleItem` *(keep)* |
| `parseCaseValuesFromText` | (part of `case_clause`) | `parseCaseValues` |
| `parseReturnRegsFromText` | `ret_regs` | `parseRetRegs` |
| `parseOpMatcherFromText` | `matcher_type` | `parseMatcherType` |
| `parseNumberLiteral` | `int_dec` / `int_hex` / `int_bin` | `parseIntLiteral` |

The `FromText` suffix is an implementation detail (vs. parsing from token stream) that clutters the name. Drop it consistently.

**Note:** This is a repo-wide rename. Each rename should be a single commit with mechanical find-and-replace, verified by `tsc --noEmit`.

### Phase 5: Split Monolithic Dispatchers

#### 5a. Split `parseAsmStatement` (~436 lines)

Extract each structured-control production into its own function in a dedicated file:

| Production | New Function | Stays In |
|---|---|---|
| `if_stmt` | `parseIfStmt()` | `parseAsmStatements.ts` or new `parseAsmControl.ts` |
| `while_stmt` | `parseWhileStmt()` | same |
| `repeat_stmt` / `until` | `parseRepeatUntil()` | same |
| `select_stmt` / `case` / `else` (select) | `parseSelectStmt()` | same |

The dispatcher (`parseAsmStatement`) becomes a thin router:
```typescript
if (isControlKeyword(lower)) return parseControlStatement(lower, ...);
return parseZ80Instruction(...);
```

Where `isControlKeyword` checks against `ASM_CONTROL_KEYWORDS` from `grammarData.ts`.

#### 5b. Refactor `parseModuleItem` (~370 lines)

Replace the sequential `consumeTopKeyword` chain with a table-driven dispatch:

```typescript
const ITEM_PARSERS: Record<string, (tail: string, ...) => ParseItemResult> = {
  import: parseImportItem,
  type: parseTypeItem,
  union: parseUnionItem,
  func: parseFuncItem,
  op: parseOpItem,
  extern: parseExternItem,
  enum: parseEnumItem,
  section: parseSectionItem,
  align: parseAlignItem,
  const: parseConstItem,
  bin: parseBinItem,
  hex: parseHexItem,
  data: parseDataItem,
};
```

The dispatcher extracts the keyword, looks it up in the table, and calls the handler. Each handler is a small function (~20 lines) that calls into the existing dedicated parser modules.

### Phase 6: Data-Driven Operator Precedence

Replace the `precedence()` switch with a lookup against `OPERATOR_PRECEDENCE` from `grammarData.ts`:

```typescript
const OP_PREC_MAP = new Map<string, number>();
for (const { level, ops } of OPERATOR_PRECEDENCE) {
  for (const op of ops) OP_PREC_MAP.set(op, level);
}

function precedence(op: string): number {
  return OP_PREC_MAP.get(op) ?? 0;
}
```

This is a small change but it means the precedence table is defined in `grammarData.ts` alongside the operator sets, making it trivially auditable against the grammar doc.

**File:** `src/frontend/parseImm.ts` lines 253-274.

### Phase 7: Grammar Doc Generation (End State)

Once `grammarData.ts` is the single source of truth for all grammar atoms, write a script (or test) that:

1. Reads `grammarData.ts` at build time
2. Generates the lexical and atom sections of `zax-grammar.ebnf.md`
3. Either overwrites the relevant sections in the doc, or asserts that they match (CI check)

The structural productions (module_item, func_decl, etc.) remain hand-written in the doc since they describe recursive structure that isn't captured by flat data tables. But the leaf productions — registers, condition codes, scalar types, operators, escapes, matcher types — are generated.

**This phase is explicitly deferred.** It depends on Phases 1-6 being complete and stable. It should be a separate PR.

---

## Ordering and Dependencies

```
Phase 1 (grammarData.ts)
  |
  +---> Phase 2 (cc validation) — depends on CONDITION_CODES from Phase 1
  +---> Phase 3 (stripLineComment dedup) — independent, can run in parallel
  +---> Phase 6 (data-driven precedence) — depends on OPERATOR_PRECEDENCE from Phase 1
  |
Phase 4 (function renames) — independent of Phases 2/3/6, but easier after Phase 1
  |
Phase 5 (split dispatchers) — easier after Phase 4 (names stabilized)
  |
Phase 7 (doc generation) — deferred, depends on all above
```

**Recommended merge order:**
1. Phase 1 — single PR, largest change, foundational
2. Phases 2 + 3 + 6 — can be one PR or three small PRs (all trivial once Phase 1 lands)
3. Phase 4 — mechanical rename PR
4. Phase 5 — structural refactor PR
5. Phase 7 — separate follow-up PR

---

## Risk Assessment

| Phase | Risk | Mitigation |
|---|---|---|
| 1 | Regressions from wiring changes | Existing 20+ parser test files provide coverage. Run full suite after each consumer update. |
| 2 | Breaking programs that use invalid cc | By design — these are bugs. Could add a deprecation warning first if needed. |
| 3 | Trivial — import path changes only | Mechanical, low risk. |
| 4 | Churn — many call sites rename | Use TypeScript compiler to find all references. Single mechanical commit per rename. |
| 5 | Behavioral change in dispatcher order | Table-driven dispatch must preserve the same keyword priority. Write explicit tests for ambiguous cases (e.g., `data` as keyword vs. section-scoped data decl). |
| 7 | Generated doc diverges from hand-written sections | CI check ensures sections match. Human-written structural sections clearly delimited. |

---

## Verification

### After Phase 1
- `npx tsc --noEmit` — type-checks pass
- `npm test` — all 20+ parser test suites pass
- Manual: verify `grammarData.ts` exports match the sets documented in `zax-grammar.ebnf.md`

### After Phase 2
- New test cases: `if foo` emits diagnostic, `while bar` emits diagnostic, `until baz` emits diagnostic
- Existing tests with valid cc (`z`, `nz`, `c`, `nc`) still pass

### After Phase 5
- Byte-for-byte identical AST output for all existing test fixtures
- New unit tests for each extracted control-flow parser function

### After Phase 7
- CI script generates grammar atom sections and diffs against `zax-grammar.ebnf.md`
- Any mismatch fails the build

---

## Files Summary

**New files:**
- `src/frontend/grammarData.ts` — shared grammar atoms

**Modified files (Phase 1):**
- `src/frontend/parseOperands.ts` — register set from grammarData
- `src/frontend/parseModuleCommon.ts` — keywords + return regs from grammarData
- `src/frontend/parseAsmStatements.ts` — control keywords from grammarData
- `src/frontend/parseImm.ts` — operators, escapes, precedence from grammarData
- `src/frontend/parseParams.ts` — matcher types from grammarData
- `src/frontend/parseParserShared.ts` — delete keyword set, re-export from grammarData

**Modified files (Phase 2):**
- `src/frontend/parseAsmStatements.ts` — cc validation at 3 locations

**Modified files (Phase 3):**
- `src/frontend/parseFunc.ts` — delete private stripComment

**Modified files (Phase 4):**
- All parser files — function renames (mechanical)

**Modified files (Phase 5):**
- `src/frontend/parseAsmStatements.ts` — split into router + extracted functions
- `src/frontend/parser.ts` — table-driven keyword dispatch

**New files (Phase 7):**
- `scripts/generate-grammar-atoms.ts` or test assertion
