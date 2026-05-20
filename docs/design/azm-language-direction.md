# AZM language direction

Status: design discussion capture
Date: 2026-05-14

## Purpose

AZM is the new project direction split from the ZAX codebase after the 0.3
release line. ZAX 0.3 remains the preserved structured-assembler release. AZM
starts from the focused Z80 assembler baseline and builds upward one small,
assembly-first feature at a time.

AZM is not ZAX 0.4. It has zero users to preserve compatibility for, so the
project should not carry old AZM/ZAX experiments as language promises. The
compatibility target is only the documented ASM80 baseline plus the canonical AZM
features deliberately retained here: register-care, AZMDoc, visible `op`
expansion, directive aliases, and layout constants.

The project name is **AZM** because it contains both "assembler" and "Z80" in a
short form that works as a project name and CLI name. Source uses ordinary
`.asm` and `.z80` filename suffixes; AZM does not define its own filename suffix.

The current repository and package still contain inherited ZAX public names.
Those names are cleanup debt unless they describe source-history internals that
have not yet been renamed.

AZM should not present itself as a full ASM80 replacement. ASM80 is permissive,
forgiving, and syntax-heavy. AZM uses a proven ASM80-style subset as a practical
starting point, but it should become a stricter and more focused assembler.

## Project split

The split is conceptual first and repository-level second:

- ZAX 0.3 is the preserved public release line for the earlier structured
  assembler language.
- AZM is a new project built from the current assembler-compatible codebase.
- AZM should keep the ASM80 corpus gates as its foundation, but should not
  inherit any ZAX feature by default.
- AZM should delete, reject, or quarantine ZAX-era features rather than present
  them as backward compatibility.
- Old ZAX/Zags ideas are a reservoir, not a migration checklist.

The core question for every feature is not "can old ZAX do this?" or "does
ASM80 accept this?" The question is whether the feature helps a Z80 assembly
programmer express machine-level intent more clearly.

## Assembler philosophy (normative)

AZM is an assembler with advanced **constant** expressions, not a compiler that
hides runtime work. The programmer writes opcodes; the assembler resolves labels,
fixups, and compile-time arithmetic.

Normative detail lives in
`docs/design/azm-expression-and-visibility.md`. In short:

- **Expression features** (`sizeof`, `offset`, layout casts, `.equ`) fold at
  assemble time and feed ordinary operands.
- **Hidden lowering** (synthesized indexing, typed assignment, typed memory
  pipelines) is ZAX-era behavior and is retired from AZM `.asm` and `.z80` source.
- **Output visibility**: instructions in source should match instructions in
  output, except for explicit visible expansions such as `op` bodies.

Layout-cast syntax such as `<Sprite[16]>SPRITES[3].flags` is sugar for the same
constant as `SPRITES + 3 * sizeof(Sprite) + offset(Sprite, flags)` — not a typed
load or address-calculation subroutine.

## Subroutines: CALL/RET only

AZM has no function declarations, formal parameters, function-local variable
blocks, or module graph. Subroutines are ordinary Z80 assembly:

- entry points are **labels** at source-file top level (ASM80-style)
- control transfer uses **`call`** and **`ret`** (or tail jumps where appropriate)
- register and stack contracts are documented with AZMDoc / register-care, not
  inferred from a high-level `func` signature
- placement uses **`org` / `.org`** and data directives (`.db`, `.dw`, `.ds`), not
  ZAX `section` blocks

Inherited ZAX `func` / `export func` and `section code/data` syntax are **rejected**
in `.asm` source. Unsupported filename suffixes are not an AZM compatibility
guarantee.

AZM `.asm` and `.z80` source files are flat. They accept layout declarations, constants,
`op` declarations, labels, Z80 instructions, `.org`, `.equ`, raw data
directives, includes, and directive aliases. They do not use the inherited ZAX
function/section shim.

AZM does not use the inherited ZAX `import` module system. It uses
ASM80-style textual inclusion: included source is part of the including
translation unit for parsing, symbol resolution, register-care analysis, and
emission. Future symbol-visibility experiments may happen later, but they are
not part of the near-term AZM language surface.

AZM also rejects ZAX `export` visibility markers. Included source is
ordinary source text; symbols are visible by assembler rules, not by a module
import/export graph.

The near-term AZM source shape is:

- flat labels and explicit `call` / `ret`, no `func`;
- `.org` plus labels and raw `.db` / `.dw` / `.ds` data, no named `section`
  blocks;
- `op` as the only runtime code-generation extension, with expansion visible at
  the call site;
- layout casts and layout paths that fold to constants only.

## Language stance

AZM should be strict, modern, and assembly-first:

- The machine must remain visible.
- Compatibility should be corpus-driven.
- Errors should be precise rather than forgiving.
- Canonical AZM style should prefer a clean dotted directive family such as
  `.org`, `.equ`, `.db`, `.dw`, `.ds`, and `.include`.
- Legacy forms such as `ORG`, `EQU`, `DB`, `DW`, and `DS` can be accepted as
  compatibility aliases, but should not be the style taught in canonical AZM
  examples.
- Macros, broad directive coverage, alias dialects, and unusual assembler
  variants should stay out of scope unless a real corpus forces a concrete
  decision.

The long-term posture is:

> AZM accepts enough legacy assembly to be useful, but teaches and enforces a
> cleaner assembler dialect over time.

## Compatibility input and canonical AZM style

AZM should distinguish compatibility input from canonical style.

Compatibility input:

- accepts documented ASM80-style forms needed by real source corpora
- keeps `.asm` and `.z80` useful for existing programs
- allows directive aliases where they normalize to the same underlying
  assembler operation

canonical AZM style:

- uses `.asm` as the preferred extension
- documents dotted directives as canonical
- uses AZMDoc comments for structured metadata that remains readable as prose
- introduces new language features only where they compose with ordinary
  assembly
- may eventually support a strict AZM mode that rejects undotted legacy
  directives unless compatibility aliases are explicitly enabled

This gives AZM an adoption path without letting old assembler permissiveness
define the language.

## Layout metadata, not typed memory access

AZM should keep the useful part of the inherited ZAX type system: compile-time
memory layout calculation.

Assembly programs frequently need to describe arrays, records, arrays of
records, packed tables, hardware register blocks, and overlay views. Hand-coded
field offsets and byte counts are fragile. AZM should provide layout
declarations and constant expressions so those values stay correct:

```asm
type Sprite
    x:     byte
    y:     byte
    tile:  byte
    flags: byte
end

SPRITE_SIZE  .equ sizeof(Sprite)
SPRITE_FLAGS .equ offset(Sprite, flags)

SPRITES:
    .ds sizeof(Sprite[16])
```

This is still assembly. The CPU calculates runtime addresses, and the
programmer writes the instructions that do that calculation. AZM should not
infer typed access from uncast expressions such as `Sprite[HL].flags`, and it
should not hide runtime address calculation behind typed assignment.

The intended AZM layout feature set is:

- exact packed sizes
- record and union layout descriptions
- array type expressions for byte counts and strides
- `sizeof(...)`
- `offset(...)`, including nested field paths
- explicit layout-cast address expressions such as
  `<Sprite[16]>SPRITES[BASE + 1].flags`
- ordinary constants derived from those expressions

The cast form is important because it keeps intent local. The label does not
need to be permanently typed; the source line says which layout to apply.
Bracket indexes inside the cast path must be compile-time constants. Actual Z80
memory dereference remains the normal parenthesized form:

```asm
ld hl,<Sprite[16]>SPRITES[BASE + 1].pos.x
ld a,(<Sprite[16]>SPRITES[BASE + 1].flags)
```

The deeper design is captured in
`docs/design/exact-size-layout-and-indexing.md`.

## Enums as constant namespaces

AZM should keep enums as assembler-level constant namespaces. An enum member is
an integer constant with a qualified name, not a runtime type:

```asm
enum Tile Empty, Wall, Pill, Power

START_TILE .equ Tile.Pill

Tiles:
    .db Tile.Empty, Tile.Wall, Tile.Power
```

Qualified enum members are valid anywhere a compile-time immediate expression is
valid: instruction operands, `.equ` constants, data directives, reserve counts,
and layout expressions. Unqualified member names are rejected because they make
assembly listings harder to read and can become ambiguous as programs grow.

Enums do not currently attach type information to registers, memory, labels, or
routine contracts. They are named constants first. A future checker may use enum
metadata to improve diagnostics, but that should not change the assembled bytes.

## Ranges as future validation facts

Ranges are a plausible AZM feature, but they should start as compile-time
validation facts rather than as runtime data types. Useful examples include:

- checking that a table index constant is inside a documented span;
- checking that a port, tile, opcode field, or screen coordinate constant fits a
  known domain;
- documenting that a generated table covers values `0..N-1`;
- helping tooling explain why a constant is out of range.

Ranges should not cause hidden code generation, runtime bounds checks, or typed
register tracking in the near-term AZM surface. They belong in the same family
as enum and layout metadata: facts the assembler can use to name and validate
constants while leaving the machine code visible.

## Rejected high-level syntax

AZM `.asm` and `.z80` source rejects the high-level ZAX surface. The rejection list is the
deletion boundary for parser and lowering work:

- `func` and `export func`;
- named `section code` and `section data` blocks;
- `:=` typed assignment;
- structured control such as `if`, `while`, `repeat`, and `select`;
- typed `data`, `var`, `globals`, locals, arguments, and typed `extern func`
  declarations;
- inherited ZAX `import` modules;
- runtime typed effective-address lowering, including register-indexed layout
  paths that require generated address code.

Default AZM guardrails exercise flat assembly, register-care, directive aliases,
ops, layout constants, and explicit rejection of retired ZAX constructs.

## AZMDoc comments

AZMDoc is the metadata-comment standard for AZM source. It follows the JSDoc
principle that documentation remains ordinary prose, while known `@` tags add
machine-readable structure inside comments.

The canonical style is:

```asm
; Loads the pending candidate coordinate.
; Returns @out D as pending x and @out E as pending y.
; Uses @clobbers A as scratch.
LOAD_DE_FROM_PENDING:
```

AZMDoc is part of the assembler baseline because it affects tooling, not object
code. ASM80 and other legacy assemblers still see normal semicolon comments.
AZM can use the metadata for register-care analysis, syntax highlighting,
documentation extraction, linting, and generated contract comments or external
contract data.

The normative draft is `docs/spec/azmdoc.md`.

## Directive aliases

Normative spec: `docs/design/azm-directive-aliases.md`.

Directive aliases are a narrow import mechanism: map external assembler directive
**heads** (`DEFB`, `DB`, …) onto the canonical dotted set (`.db`, …) before
parse. They are not macros and must not rewrite expressions or inject
instructions.

Over time, AZM can add linting or formatting support that encourages canonical
AZM spelling:

```asm
.org 4000h
start:
    ld a, 42
message:
    .db "OK", 0
buffer:
    .ds 32
```

## Directive aliases and ops (kept by design)

AZM uses two different extension mechanisms. Do not conflate them with macros or
with layout expressions.

### Directive aliases

canonical AZM style uses a **strict, small** directive set (`.db`, `.dw`, `.ds`,
`.org`, `.equ`, …). **Directive aliases** map foreign spellings (`DEFB`, `DB`,
`ORG`, …) onto those canonical forms via normalization before parse. This is
intentional compatibility glue, not a macro language. Aliases must not rewrite
expression text, inject instructions, or claim AZM language heads such as `op`.
Details: `docs/spec/azm-assembly-baseline.md`.

### `op` — AST idioms, not text macros

AZM **rejects** a text-based macro preprocessor. It **keeps** the ZAX `op`
system: parsed AST declarations that expand **inline at the call site** into
ordinary instructions the programmer can inspect in listings.

Ops exist to give the CPU “superpowers” — named instruction patterns such as a
multiply built from adds/shifts, or `clear_a` → `xor a`. That is deliberate opcode
generation, but it is **visible** and **site-local**, unlike typed memory lowering.

The AZM `op` surface will be **simpler than ZAX** (operand matching without full
ZAX type-signature machinery). ZAX-only op behavior should be removed from the
AZM assembler subset as the surface hardens.

The design goal is:

> Reusable machine idioms via AST `op`s and strict directives; compatibility via
> directive aliases; not via text macros or hidden typed access.

Normative rules: `docs/design/azm-ops-subset.md`. How ops relate to “no hidden
codegen” for layout/constants: `docs/design/azm-expression-and-visibility.md`.

## AST ops instead of text macros (summary)

Text macros remain out of scope. `op` is in scope and is a core AZM feature
inherited from ZAX, subject to the alpha subset and simplification above.

## Branch-helper research stays separate

AZM should not rush back into old ZAX structured programming. Assembly
programmers need to see and reason about jumps, labels, branches, registers,
stack effects, and memory layout.

Helpers for backpatching or local-label management may be useful later, but
they are not part of the current good-assembler baseline. Any such helper must
remain explicit, expand to visible labels/fixups/Z80 branch instructions, and
avoid built-in `if`, `while`, `repeat`, or function-like syntax.

## Layout constants, not typed access

The inherited ZAX type-related ideas split into two categories.

The part AZM should keep early is layout metadata and **constant expression**
support:

1. records and unions as memory layout descriptions
2. array type expressions for byte counts and strides
3. `sizeof(...)`
4. `offset(...)`
5. layout-cast syntax that folds to the same values as (3) and (4)
6. constants and operands derived from those expressions

The part AZM should remove from old ZAX is typed memory access and hidden
codegen:

- `func` frames as a high-level routine model (unless replaced by explicit,
  visible procedure helpers)
- typed assignment with `:=`
- compiler-lowered field/index memory access at runtime
- typed `data`, `var`, and `globals` storage blocks
- structured control hidden inside function bodies
- routing layout constants through hidden typed load/store or EA materialization
  pipelines

The programmer writes the instructions that calculate **runtime** addresses,
load bytes, store words, and branch. Layout casts only simplify **compile-time**
address constants in those instructions. They must never emit hidden multiply/add
or indexed addressing the programmer did not write.

Implementation should fold casts in the **expression** layer and present plain
fixup operands to instruction emission — not treat casts as a separate lowering
feature. See `docs/design/azm-expression-and-visibility.md`.

## Register-care contracts

AZM should improve subroutine safety through AZMDoc and register-care analysis,
not by adding a procedure language. A programmer still writes labels, `call`,
`jp`, `ret`, stack operations, and register moves directly. Contracts describe
what that code expects, returns, clobbers, or preserves.

The assembler may infer and check those contracts, and tools may generate
contract comments or external register-care contract data. This is metadata and linting
over visible assembly, not generated frames, formal arguments, or callee-managed
calling conventions.

## Non-goals

AZM should not try to become:

- a full ASM80 clone
- a permissive historical assembler dialect aggregator
- a macro preprocessor
- a Forth system
- a Pascal or C compiler with Z80 syntax
- a resurrection of all old ZAX/Zags features
- a hidden runtime or callee-managed calling-convention system

The guiding principle is to add only features that help an assembly programmer
write clearer, safer, more maintainable Z80 code while preserving direct
visibility of the generated machine behavior.

## Open design questions

These questions should be resolved before implementation:

1. Should directive aliases be fixed, configurable, or mode-dependent?
2. How strict should `.asm` become over time after the first hard-removal
   boundary is in place?
3. How much of the existing `op` implementation can be reused while keeping the
   surface assembler-facing?
4. What is the smallest explicit branch/fixup helper set that would help
   hand-written assembler without hiding generated control flow?
5. Should call-site register-care annotations be required, optional, lint-only,
   or inferred from explicit save/restore code?
6. Should `IX` and `IY` get any recommended convention in AZM examples, or
   should the assembler stay neutral?

## Near-term recommendation

Preserve the ASM80 baseline as the floor, delete removed language features, then
design AZM in this order:

1. rename and reposition project identity around AZM
2. document ASM80 baseline source versus preferred AZM style
3. implement or formalize directive alias normalization
4. bring back AST ops as the macro replacement
5. keep branch/fixup helper research explicit and non-magical
6. formalize layout constants only where their assembler-facing model is clear

The next development step should be implementation around directive aliases,
AST ops, register-care contracts, and layout constants. Any branch/fixup helper
research should stay separate until its emitted control flow remains fully
inspectable.
