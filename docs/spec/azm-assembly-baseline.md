# AZM assembly baseline

Status: draft baseline standard
Date: 2026-05-17

## Purpose

This document defines the assembler-facing baseline for AZM. AZM starts from the
documented ASM80 compatibility subset, then adds stricter and more expressive
tooling conventions without hiding the Z80 machine model.

AZM has no user compatibility burden for old AZM or ZAX experiments. It is not
ZAX 0.4, and it does not promise migration compatibility with the retired
structured-language surface. The only compatibility baseline is the documented
ASM80 subset plus the AZM features this document explicitly keeps.

The baseline is intentionally smaller than "every ASM80 feature". It is the
canonical surface AZM should teach, syntax-highlight, lint, and extend.

## Standards stack

AZM is defined as a small stack of compatible standards:

- **ASM80 compatibility baseline**: the corpus-driven subset documented in
  `docs/design/asm80-compatibility-baseline.md`.
- **canonical AZM assembly style**: the preferred spelling and stricter habits for
  new AZM source.
- **AZMDoc**: ordinary semicolon comments with structured `@` metadata tags, as
  defined in `docs/spec/azmdoc.md`.
- **Register-care contracts**: an AZMDoc vocabulary used by the register-care
  analyzer to describe register inputs, outputs, clobbers, and preservation.

These standards must remain compatible with ordinary ASM80-style source. AZMDoc
metadata is carried in comments, so other assemblers ignore it.

## Source modes

AZM accepts the following source families:

- `.asm` and `.z80`: AZM source inputs using the supported ASM80-style
  baseline plus retained AZM features.
- `.asm`: preferred filename suffix for new source owned by this project.

Canonical AZM examples should prefer the AZM style in this document. Compatibility
inputs may retain historical forms where they are part of the accepted baseline.

Internal package, diagnostic, script, and fixture names should use AZM or
ASM80 terminology. Remaining ZAX spelling is cleanup debt, not compatibility.

## Canonical AZM source

AZM accepts flat assembler items at source-file top level: labels, local labels,
Z80 instructions, `.org`, `.equ`, `.db`, `.dw`, `.ds`, includes, directive aliases,
`op` declarations, and layout metadata.

Layout metadata means `type`, `union`, `sizeof`, `offset`, and layout-cast
address expressions that fold to constants. AZM feeds those constants into
ordinary operands and fixups.

AZM rejects or quarantines inherited ZAX high-level constructs: `func`,
named `section` blocks, `:=`, structured control, typed storage, typed externs,
generated function frames, locals, formal arguments, typed argument
marshalling, module imports, and runtime typed effective-address lowering.

The default AZM verification lane is `npm run test:azm:alpha`. New retained
coverage should use `.asm` or `.z80` source. Historical non-ASM fixtures are
retired-regression cleanup debt, not a compatibility promise.

## Canonical style

AZM source should use:

- semicolon comments
- ordinary Z80 mnemonics
- labels with a colon
- idiomatic ASM80-family directives such as `ORG`, `EQU`, `DB`, `DW`, `DS`,
  `.include`, `.align`, `.binfrom`, and `.end`
- AZMDoc metadata comments for machine-checkable documentation

AZM is a stricter ASM80-family dialect, not a permissive clone of every
historical assembler spelling. It accepts the idiomatic ASM80 subset used by the
standing corpora, while project-local variants should enter through the
directive-alias mechanism rather than becoming core parser syntax.

## Directive aliases

Normative design: `docs/design/azm-directive-aliases.md`.

Summary:

- **Canonical** directives are the small dotted set (`.db`, `.dw`, `.ds`,
  `.org`, `.equ`, `.include`, `.end`, …).
- The built-in **`azm` profile** maps common undotted heads (`DB`, `ORG`, `EQU`,
  …) to those canonical forms before parse.
- **Project JSON** supplies extra heads (`DEFB`, `DEFW`, `RMB`, …) per corpus;
  see the design doc for the full table and rules. These heads must not collide
  with Z80 mnemonics or AZM language keywords such as `op`.

This is deliberately not a macro system: only directive heads are rewritten,
never operands, expressions, or instructions.

## Layout constants (canonical AZM)

AZM extends the expression language with layout metadata (not typed memory
access):

- `type` / `union` — packed layout descriptions
- `sizeof(Type)` / `sizeof(Type[N])` — exact byte size
- `offset(Type, path)` — field path offset
- `<Type[N]>label[i].field` — layout-cast syntax; must fold to the same constant
  as the `sizeof`/`offset` form; compile-time indexes only

These fold at assemble time and feed ordinary operands. They must not emit hidden
indexing code. See `docs/design/exact-size-layout-and-indexing.md` and
`docs/design/azm-expression-and-visibility.md`.

The intended layout declaration spelling is assembler-like:

```asm
.type Sprite
x       .field 1
y       .field 1
flags   .field 1
.endtype
```

`.type` is a block declaration. AZM does not accept one-line type aliases such
as `.type Pair byte[2]`; use a field block and use array type expressions at the
point of `sizeof`, `offset`, or layout-cast use.

Within layout declarations, `.byte`, `.word`, and `.addr` are planned aliases
for field sizes, not emitted storage:

```asm
.type Bullet
x       .byte
y       .byte
timer   .word
ptr     .addr
.endtype
```

The older colon form (`x: byte`) is not AZM syntax.

## Enum constants (canonical AZM)

`enum` declarations create qualified integer constants:

```asm
enum Mode Read, Write, Append
```

Members are addressed as `Mode.Read`, `Mode.Write`, and so on. They are valid in
any compile-time immediate expression, including instruction operands, `.equ`,
`.db`, `.dw`, and `.ds`. Unqualified member references are rejected. Enums do not
currently create runtime types, register types, or memory types.

Ranges are not part of the AZM assembler baseline yet. They remain a design
candidate for compile-time validation of constants and tables, not for hidden
runtime checks or typed code generation.

## Ops (canonical AZM)

`op` declarations inline-expand at call sites into ordinary instructions (AST
substitution, not text macros). They are the extension mechanism for reusable
instruction idioms; directive aliases must not be used to emulate them. See
`docs/design/azm-ops-subset.md`.

## Required assembler surface

The assembler baseline includes:

- global labels, explicit routine-entry labels, and local labels
- label plus statement on one line
- `EQU` / `.equ` constants and expression aliases
- `ORG` / `.org` placement
- `INCLUDE` / `.include "file"` with relative include resolution
- `DB` / `.db`, `DW` / `.dw`, and `DS` / `.ds`
- `.align`
- `.cstr`, `.pstr`, and `.istr`
- `.binfrom` and `.binto`
- `.end`
- Z80 instruction syntax needed by the active corpus set
- semicolon comments, including AZMDoc metadata comments

The exact compatibility corpus and directive details remain documented in
`docs/design/asm80-compatibility-baseline.md`.

## Label and routine boundary policy

AZM uses label spelling as source-level intent. In ASM80-compatible source, a
label may be prefixed with `@` to mark it as an AZM routine entry:

```asm
@CHECK_COLLISION_AT_DE:
        call    SHIFT_ROW_MASK
        ret
```

The callable symbol name is `CHECK_COLLISION_AT_DE`, without the `@`. This
matches ASM80's accepted spelling for exported labels and remains acceptable to
ASM80 outside `.BLOCK`, while AZM gives the spelling an additional meaning for
register-care analysis.

When a file contains one or more `@` entry labels, AZM uses those labels as the
routine-boundary source of truth:

- an `@Name:` label starts an executable routine entry named `Name`
- consecutive `@` labels before the first instruction are aliases for the same
  entry body
- plain labels inside an `@` entry body are internal branch targets for analysis
- the next `@OtherName:` starts the next analyzed routine body
- references still use `Name`, not `@Name`

This first policy does not enforce symbol privacy. Until AZM adopts a stricter
AZM privacy mode, plain internal labels remain ordinary ASM80-compatible
symbols and must still be globally unique where ASM80 requires that.

In source that does not use `@` entry labels, AZM falls back to the older
plain-label heuristic: a non-local executable label after at least one
instruction starts a new routine boundary, and consecutive non-local labels
before the first instruction are aliases for the same entry point.

A leading-dot label is also accepted by AZM as a local branch target scoped to
the preceding routine entry:

```asm
CHECK_COLLISION_AT_DE:
        push    bc
        ld      b,4
.row:
        djnz    .row
.exit:
        pop     bc
        ret
```

Use `@` labels for callable routine entries and intentional tail-call targets.
Use plain or leading-dot labels for loops, exits, joins, error branches, and
other intra-routine waypoints. Leading-dot labels are the preferred canonical AZM
local-label spelling once ASM80 compatibility is no longer required; plain
internal labels are the compatibility bridge for now.

Data labels are still non-local symbols, but they are not routine labels and
should not receive AZMDoc register contracts. Source should keep data labels
visibly outside executable routine bodies where practical. Inline tables or
embedded data after instructions need an explicit convention before the
register-care analyzer can safely reason about them.

This policy matters because AZM's register-care checker infers contracts over
routine bodies. In plain-label mode, an internal branch target written as
a non-local label must be treated as a possible new routine. That can split a
push/pop-protected routine in the middle and make preserved scratch registers
look like outputs or clobbers. The `@` entry policy avoids that failure by
making routine entries explicit while leaving internal labels inside the current
analysis span.

## AZMDoc position

AZMDoc is part of the AZM assembly baseline, not a separate language. It adds
structured meaning to comments, but it does not change emitted bytes.

Tools may use AZMDoc for:

- syntax highlighting
- hover help and outline views
- register-care analysis
- generated AZMDoc contract comments or external register-care contract data
- documentation extraction
- linting and formatting

Assemblers that do not understand AZMDoc still see ordinary comments.

The companion draft TextMate grammar is `docs/spec/azm.tmLanguage.json`, with
usage notes in `docs/spec/azm-textmate-highlighting.md`.

## Non-goals

The baseline does not include:

- ASM80 text macros
- broad directive alias coverage inside the parser
- non-Z80 targets
- hidden calling conventions
- automatic register preservation
- high-level control flow as a prerequisite for useful assembly

AZM language features should be added only when they improve handwritten Z80 assembly
without obscuring registers, flags, memory, ports, or control flow.
