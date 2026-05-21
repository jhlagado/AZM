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
- `sizeof(Type)` / `sizeof(Type[N])` — exact byte size when an explicit size
  query reads better than a bare type expression
- `offset(Type, path)` — field path offset
- `<Type[N]>label[i].field` — layout-cast syntax; must fold to the same constant
  as the `sizeof`/`offset` form; compile-time indexes only

These fold at assemble time and feed ordinary operands. They must not emit hidden
indexing code. See `docs/design/exact-size-layout-and-indexing.md` and
`docs/design/azm-expression-and-visibility.md`.

### Type expressions as byte-size expressions

AZM treats layout types as byte-size expressions only where the grammar is
already asking for a size. The built-in scalar layout types are:

- `byte` — 1 byte
- `word` — 2 bytes
- `addr` — 2 bytes, used for address-sized fields

Named record and union layouts follow the same rule: the name evaluates to that
layout's exact packed size when it appears in a layout-size position.

```asm
byte        ; 1
word        ; 2
addr        ; 2
Sprite      ; sizeof(Sprite)
byte[10]    ; 10
word[10]    ; 20
Sprite[10]  ; sizeof(Sprite) * 10
```

This is intentionally small. Type expressions are compile-time size values, not
typed variables and not hidden memory operations. They are accepted where AZM is
asking for layout size: `.field`, `.ds`, `sizeof(...)`, `offset(...)`, and
layout casts.

That means `byte[10]` literally evaluates to the byte count `10`, and
`word[10]` evaluates to `20`, when the grammar is asking for a layout size.
The same rule applies to user layouts: `Sprite[10]` evaluates to ten times the
exact packed size of `Sprite`.

Use `sizeof(...)` when it makes a constant definition clearer:

```asm
SPRITE_SIZE  .equ sizeof(Sprite)
SPRITE_X     .equ offset(Sprite, x)
SPRITE_FLAGS .equ offset(Sprite, flags)
```

Use the bare type expression when the surrounding directive already means
"reserve this many bytes":

```asm
SPRITES:
    .ds Sprite[16]
```

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

Within layout declarations, `.byte`, `.word`, and `.addr` are type shorthands
for `.field byte`, `.field word`, and `.field addr`. They do not emit storage:

```asm
.type Bullet
x       .byte
y       .byte
timer   .word
ptr     .addr
.endtype
```

The equivalent spelling is:

```asm
.type Bullet
x       .field byte
y       .field byte
timer   .field word
ptr     .field addr
.endtype
```

That means `.word` is literally `.field word` in layout terms, and `word`
has size 2. These directives describe fields inside the enclosing layout;
they do not emit bytes by themselves. Outside a layout declaration, `.byte`,
`.word`, and `.addr` are not data-emission directives; storage and data use
`.ds`, `.db`, `.dw`, and the string directives.

Pointer-sized fields use `.addr` or `.field addr`. AZM does not keep a typed
pointer field syntax such as `.field @Sprite`; layout declarations describe
byte sizes and offsets, not typed memory references.

Array fields use the same type-expression rule:

```asm
.type Buffer
data    .field byte[256]
cursor  .word
.endtype
```

`data .field byte[256]` reserves 256 bytes inside the record layout.
`data .field word[256]` would reserve 512 bytes. No initialization is implied.

## Storage and initialized data

AZM keeps storage allocation and data initialization separate.

`.ds` reserves storage. Its operand is a byte count. A type expression in this
position evaluates to its exact byte size:

```asm
OneByte:
    .ds byte           ; 1 byte

Bytes:
    .ds byte[256]      ; 256 bytes

OneWord:
    .ds word           ; 2 bytes

Words:
    .ds word[8]        ; 16 bytes

OneSprite:
    .ds Sprite         ; sizeof(Sprite)

Sprites:
    .ds Sprite[16]     ; sizeof(Sprite) * 16
```

The array form is only a size expression. It does not initialize elements and
does not create a typed label. `.ds Sprite[16]` is shorthand for reserving
`sizeof(Sprite[16])` bytes.

The optional `.ds` fill operand is still an immediate byte value:

```asm
Scratch:
    .ds word[8],0      ; reserve 16 bytes filled with zero
```

Do not read `.ds byte[10]` as a new data declaration language. It is the
ordinary `.ds` directive with a clearer size expression. The same expression
could be written as `.ds 10`; the type form is useful because it documents
layout intent and scales cleanly from scalars to records.

`.db` and `.dw` define initialized data values:

```asm
Message:
    .db "hello",0

Table:
    .dw 1000H,2000H,3000H
```

These are not aliases for `.ds byte` or `.ds word`, because they emit values.
Use `.db` / `.dw` when the source contains initialized bytes or words. Use
`.ds byte`, `.ds word`, `.ds Sprite`, or array type expressions when the source
only reserves space.

String directives are initialized data shorthands with specific encodings:

```asm
CMessage:
    .cstr "hello"      ; bytes: h e l l o 0

PMessage:
    .pstr "hello"      ; bytes: 5 h e l l o

IMessage:
    .istr "hello"      ; bytes: h e l l (o | 80H)
```

The canonical spellings are `.db`, `.dw`, `.ds`, `.cstr`, `.pstr`, and
`.istr`. Undotted spellings such as `DB`, `DW`, `DS`, `CSTR`, `PSTR`, and
`ISTR` are accepted through the directive alias layer.

AZM uses the short string directive names as canonical. Longer names such as
`.cstring` and `.pstring` are not the documented AZM spelling; projects that
need those imported forms should map them through directive aliases.

In short:

- `.ds TypeExpr` reserves uninitialized storage by byte size
- `.db` / `.dw` emit initialized byte and word values
- `.cstr` / `.pstr` / `.istr` emit initialized string bytes
- `.byte` / `.word` / `.addr` are field shorthands only inside `.type` /
  `.union`

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
