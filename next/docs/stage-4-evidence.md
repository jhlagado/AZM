# Stage 4 Evidence: Expressions, Symbols, and Fixups

Status: active evidence pack

This document records the AZM evidence used before implementing Stage 4 in
AZM Next. It follows `source-of-truth.md`: tests and fixtures first, then docs
and book examples.

## Evidence Read

- `test/frontend/pr476_parse_imm_helpers.test.ts`
- `test/asm80/asm80_equ_aliases.test.ts`
- `test/asm80/asm80_directives_integration.test.ts`
- `test/pr37_fixup_negative.test.ts`
- `test/pr786_raw_data_lowering.test.ts`
- `test/fixtures/pr37_forward_label_call.asm`
- `test/fixtures/pr37_unresolved_symbol_abs16.asm`
- `test/fixtures/pr37_unresolved_symbol_rel8.asm`
- `test/fixtures/pr786_raw_data_lowering.asm`
- `docs/design/asm80-compatibility-baseline.md`
- `docs/spec/azm-assembly-baseline.md`
- sibling checkout `debug80-docs/azm-book/book1/03-assembly-language.md`
- sibling checkout `debug80-docs/azm-book/appendices/01-numbers-notation-and-ascii.md`

## Proven Behavior

### Numeric Literals

AZM accepts these immediate numeric forms:

- decimal: `123`
- dollar-prefixed hex: `$2A`
- percent-prefixed binary: `%1010`
- JavaScript-style prefixes: `0x2A`, `0b1010`
- ASM80 trailing-base literals: `0FFH`, `0ffh`, `1010B`, `1010b`

The trailing-hex ambiguity rule is intentional: `0FFH` is numeric, while `FFH`
is a symbol candidate.

### Character Literals

Current tests prove one-character quoted expressions:

- single quoted, for example `'A'`
- double quoted, for example `"Y"`
- quoted characters can appear in expressions, for example `"a"-"A"`

Invalid escapes such as `'\z'` are parse errors.

### Expression Operators

Current parser tests prove immediate expressions with:

- unary `+`, `-`, `~`
- binary `*`, `/`, `%`, `+`, `-`, `&`, `^`, `|`, `<<`, `>>`
- parentheses

Divide by zero is an error.

### Current Location

`$` by itself is the current assembly location. It can participate in
expressions such as `$+3`, `$ - 4`, `$-APITable`, and
`($-DSAPIFunctions)/2`.

`$Label` is invalid expression syntax, not a symbol named `$Label`.

### Symbols and Equates

Current tests prove:

- labels define address symbols
- `EQU` / `.equ` defines constants
- equates may refer to labels
- equates may refer to forward labels
- equates may refer to other forward equates
- compound equates such as `ALIAS+1` and `ALIAS+ALIAS` resolve after targets
  become known
- current-location context for deferred equates is preserved
- labels must not shadow unresolved equate aliases

AZM Next also has an explicit case policy: programmer-defined symbols are case
sensitive. Any current-AZM case-insensitive lookup behavior is compatibility
debt unless promoted by a test or approved design note.

### Fixups

Current fixtures prove forward references for instruction operands and raw data:

- `call target` before `target:`
- `dw handler_a, handler_b` before or across labels
- absolute unresolved symbols are diagnostics
- rel8 unresolved symbols are diagnostics
- rel8 branch displacements are range-checked as `-128..127`

## Stage 4 Implementation Plan

Implement Stage 4 in evidence-backed slices:

1. **Expression parser and evaluator slice**
   - numeric literal forms above
   - one-character quoted literals
   - unary/binary operators and parentheses
   - current location `$`
   - divide/modulo-by-zero diagnostics
2. **Deferred symbol and equate slice**
   - prescan labels and equates with addresses
   - resolve forward equates recursively
   - preserve current-location context for equates
   - reject duplicate symbol names under AZM Next's case-sensitive policy
3. **Fixup model slice**
   - introduce explicit ABS16 and REL8 fixup records
   - patch bytes after symbol resolution
   - emit unresolved-symbol and rel8 range diagnostics

## First Implemented Slice

The first Stage 4 slice should implement the expression parser/evaluator and
deferred resolution needed by `.db`, `.dw`, `.ds`, `.org`, `.equ`, and `LD A,n`
in the existing minimal assembler. It must be backed by focused AZM Next tests
that quote the proven behavior above.
