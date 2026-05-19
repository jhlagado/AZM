# AZM directive aliases

Status: normative (AZM-native)
Date: 2026-05-19

## Purpose

AZM teaches a **small canonical directive set** (dotted forms such as `.db`,
`.org`, `.equ`). Real programs use many historical spellings (`DB`, `DEFB`,
`ORG`, …). **Directive aliases** map those spellings onto canonical directives
**before parse**, without a text macro system.

This is compatibility normalization, not language extension. It must not
rewrite instructions, operands, expressions, or labels.

Related:

- `docs/spec/azm-assembly-baseline.md` — baseline surface
- `docs/design/azm-expression-and-visibility.md` — how aliases differ from `op`
- Implementation: `src/frontend/directiveAliases.ts`

## Canonical directive set

These are the only directive heads the parser accepts **natively** (after alias
resolution). All alias targets must map to one of them.

| Canonical | Role |
|-----------|------|
| `.org` | Origin / location |
| `.equ` | Named constant |
| `.db` | Define bytes |
| `.dw` | Define words |
| `.ds` | Reserve storage |
| `.align` | Alignment |
| `.include` | Include file |
| `.end` | End module / pass |
| `.cstr` | C-style string |
| `.pstr` | Pascal-style string |
| `.istr` | Inline string form |
| `.binfrom` | Binary import start |
| `.binto` | Binary import end |

AZM-native examples should use these spellings. Undotted forms such as `DB` and
`ORG` are accepted through the **built-in `azm` alias profile**, not as separate
parser dialects.

## Built-in `azm` profile

The default profile (`buildDirectiveAliasPolicy('azm')`) maps common undotted
ASM80-family heads to canonical directives:

| Alias key | Canonical |
|-----------|-----------|
| `ORG` | `.org` |
| `EQU` | `.equ` |
| `DB` | `.db` |
| `DW` | `.dw` |
| `DS` | `.ds` |
| `ALIGN` | `.align` |
| `INCLUDE` | `.include` |
| `END` | `.end` |
| `CSTR` | `.cstr` |
| `PSTR` | `.pstr` |
| `ISTR` | `.istr` |
| `BINFROM` | `.binfrom` |
| `BINTO` | `.binto` |

Keys are matched case-insensitively after normalization. A source line may use
either `DB` or `db`; both normalize to `.db` before the directive parser runs.

## Project-specific aliases

Spellings not in the built-in profile belong in a **project JSON file**, passed
via CLI (`directiveAliasFiles` / compile options). Example:

```json
{
  "extends": "azm",
  "directiveAliases": {
    "DEFB": ".db",
    "DEFW": ".dw",
    "DEFS": ".ds",
    "RMB": ".ds",
    "FCB": ".db"
  }
}
```

Rules:

- `"extends": "azm"` is required today (only built-in base profile).
- Keys must not collide with built-in profile keys (e.g. cannot redefine `DB`).
- Keys must not name Z80 instructions (`ld`, `add`, …).
- Values must be canonical dotted directives from the table above.

Recommended corpus-oriented aliases (add per project as needed):

| Alias | Maps to | Typical source |
|-------|---------|----------------|
| `DEFB` | `.db` | Some Z80 assemblers |
| `DEFW` | `.dw` | Some Z80 assemblers |
| `DEFS` / `RMB` | `.ds` | Reserve memory |
| `FCB` | `.db` | Fill constant byte |

Do not grow the built-in profile for every dialect variant; keep the core small
and push rare spellings to project files.

## What aliases rewrite

**In scope:**

- The **directive head** at the start of a statement (after an optional label).
- Normalization: case-insensitive key → canonical dotted directive.

**Out of scope:**

- Mnemonics and operands (`ld a,(hl)` is untouched).
- Symbols and expressions.
- `op` bodies (use `op`, not aliases).
- Multi-line or include-body text substitution.
- Opcode aliases (`mov` → `ld`) — not supported.

## What aliases are not

| Mechanism | Aliases | Text macros | `op` |
|-----------|---------|-------------|------|
| Input | Source file | Blocked | Parsed AST |
| Scope | Directive head | — | Call site |
| Output | Same directive, canonical spelling | — | Extra instructions |
| Purpose | Dialect compatibility | — | CPU idioms |

## Pipeline position

```
raw source line
  → (optional) label extraction
  → resolveDirectiveAlias(head, policy)
  → parse canonical directive or instruction
```

Aliases run in the ASM80/classic line path (`resolveDirectiveAlias` in
`classicLine.ts`). They are policy-driven so tests and corpora can load extra
JSON without changing the parser grammar.

## CLI and tooling

- Compile accepts `directiveAliasFiles: string[]` (see `src/compile.ts`,
  `src/pipeline.ts`).
- Package / project config may supply alias files for Tetro, Pacmo, MON3, etc.
- Linters and highlighters should highlight **canonical** directives in AZM-native
  docs; alias spellings may be noted as compatibility in grammar comments.

## Non-goals

- No arbitrary textual macro expansion.
- No alias chaining that rewrites non-directive tokens.
- No automatic inclusion of every ASM80 variant in the parser.
- No directive aliases for layout types (`type`, `sizeof`) — those are language
  features, not assembler directives.

## Review checklist

1. Does this alias only map one head to one canonical directive?
2. Could it collide with an instruction mnemonic?
3. Should it be built-in (very common) vs project JSON (corpus-specific)?
4. Does documentation teach canonical `.db` in new AZM examples?
