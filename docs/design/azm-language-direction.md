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
compatibility target is only the documented ASM80 baseline plus the AZM-native
features deliberately retained here: register-care, AZMDoc, visible `op`
expansion, directive aliases, and layout constants.

The project name is **AZM** because it contains both "assembler" and "Z80" in a
short form that works as a project name, CLI name, and source extension. The
native extended source extension should be `.azm`, while ordinary `.asm` and
`.z80` source remain accepted only to the extent they fit the documented ASM80
baseline.

The current repository and package still contain inherited ZAX public names.
Those names are tracked in
`docs/audits/zax-feature-retirement-audit.md#public-naming-inventory` and
should move only where the inventory marks the change as safe before alpha.

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
  pipelines) is ZAX-era behavior and is retired from `.azm` native mode.
- **Output visibility**: instructions in source should match instructions in
  output, except for explicit visible expansions (`op`, opt-in procedure frame
  helpers).

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
in `.azm` source. Any remaining `.zax` support is a removal target, not an AZM
compatibility guarantee.

Native `.azm` source files are flat. They accept layout declarations, constants,
`op` declarations, labels, Z80 instructions, `.org`, `.equ`, raw data
directives, includes, and directive aliases. They do not use a `.zax`
function/section shim. See `docs/audits/azm-removal-inventory.md`.

Native AZM does not use the inherited ZAX `import` module system. It uses
ASM80-style textual inclusion: included source is part of the including
translation unit for parsing, symbol resolution, register-care analysis, and
emission. Future symbol-visibility experiments may happen later, but they are
not part of the near-term AZM language surface.

The near-term native shape is:

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
- Native AZM style should prefer a clean dotted directive family such as
  `.org`, `.equ`, `.db`, `.dw`, `.ds`, and `.include`.
- Legacy forms such as `ORG`, `EQU`, `DB`, `DW`, and `DS` can be accepted as
  compatibility aliases, but should not be the style taught in AZM-native
  examples.
- Macros, broad directive coverage, alias dialects, and unusual assembler
  variants should stay out of scope unless a real corpus forces a concrete
  decision.

The long-term posture is:

> AZM accepts enough legacy assembly to be useful, but teaches and enforces a
> cleaner assembler dialect over time.

## Compatibility input and AZM-native style

AZM should distinguish compatibility input from native style.

Compatibility input:

- accepts documented ASM80-style forms needed by real source corpora
- keeps `.asm` and `.z80` useful for existing programs
- allows directive aliases where they normalize to the same underlying
  assembler operation

AZM-native style:

- uses `.azm` as the preferred extension
- documents dotted directives as canonical
- uses AZMDoc comments for structured metadata that remains readable as prose
- introduces new language features only where they compose with ordinary
  assembly
- may eventually support a strict native mode that rejects undotted legacy
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

## Rejected native syntax

Native `.azm` rejects the high-level ZAX surface. The rejection list is the
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

The temporary `.zax` test path must stay explicit until deleted. Default AZM
guardrails exercise flat assembly, register-care, directive aliases, ops, and
layout constants.

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
documentation extraction, linting, and generated interface files.

The normative draft is `docs/spec/azmdoc.md`.

## Directive aliases

Normative spec: `docs/design/azm-directive-aliases.md`.

Directive aliases are a narrow import mechanism: map external assembler directive
**heads** (`DEFB`, `DB`, …) onto the canonical dotted set (`.db`, …) before
parse. They are not macros and must not rewrite expressions or inject
instructions.

Over time, AZM can add linting or formatting support that encourages canonical
native spelling:

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

AZM-native style uses a **strict, small** directive set (`.db`, `.dw`, `.ds`,
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
native AZM subset as the surface hardens.

The design goal is:

> Reusable machine idioms via AST `op`s and strict directives; compatibility via
> directive aliases; not via text macros or hidden typed access.

Normative rules: `docs/design/azm-ops-subset.md`. How ops relate to “no hidden
codegen” for layout/constants: `docs/design/azm-expression-and-visibility.md`.

## AST ops instead of text macros (summary)

Text macros remain out of scope. `op` is in scope and is a core AZM feature
inherited from ZAX, subject to the alpha subset and simplification above.

## Structured programming should not come first

AZM should not rush back into old ZAX structured programming. Assembly
programmers need to see and reason about jumps, labels, branches, registers,
stack effects, and memory layout.

Before adding built-in `if`, `while`, `repeat`, or function-like syntax, AZM
should first provide lower-level compile-time facilities that let programmers
construct structured assembly from first principles.

The most promising facility is a small Forth-inspired assembly control stack.

## Assembly control stack

AZM should consider a narrow compile-time control stack inspired by Forth
control-flow compilation. This is not Forth as a language. It is not a second
expression evaluator, runtime stack model, or self-hosting metaprogramming
system.

The control stack exists for:

- forward references
- backpatching
- loop marks
- unresolved branch sites
- structured nesting validation
- compile-time construction of branch-based control flow

The value of the stack is that it removes the need to create user-visible local
symbol names for every small control-flow shape. Instead of manually inventing
labels such as `skip_1`, `else_2`, or `loop_3`, structured ops can push and
resolve typed compile-time items.

The stack should be structured, not general-purpose:

- top-of-stack operations only at first
- no arbitrary `swap`, `rot`, `pick`, or similar stack shuffling
- typed entries rather than raw numbers
- every pushed item must be resolved, consumed, or explicitly discarded in a
  valid way
- diagnostics should explain structural mismatches
- user-defined ops that interact with the control stack should declare their
  stack effect

## Control stack item types

The control stack should not store only the current value of `$`. A forward
branch needs more than a location; it needs a patchable site and a resolution
rule.

Likely item types:

- `mark`: a resolved assembly location, usually the current assembly pointer
- `patch`: a handle to an emitted but unresolved operand
- `frame`: an optional typed grouping marker for higher-level structures

A patch item should carry enough metadata to validate and resolve it:

```text
patch {
  site: emitted operand location
  kind: rel8 | abs16
  source: branch instruction location
  owner: optional structure id
}
```

This lets AZM check that:

- `jr` targets fit in `rel8`
- `jp` targets fit in `abs16`
- a patch is resolved exactly once
- a `then`-style operation closes the right pending patch
- an `else`-style operation transforms the right pending structure
- end of assembly rejects unresolved control-stack entries

## Primitive surface

The primitive syntax is undecided. Two plausible directions are:

1. dot-prefixed directives, such as `.mark`, `.patch`, and `.resolve`
2. a distinct compile-time prefix, such as `@mark` and `@resolve`

Dot directives fit assembler tradition because these are assembler-time
actions. A distinct prefix makes AZM compile-time control visibly separate from
ordinary directives.

The important design decision is not the prefix yet. The important decision is
that the primitive surface should expose typed patch and mark operations, not
hidden high-level control flow.

Conceptual examples:

```asm
; Push a mark for the current location.
.mark

; Emit a branch with an unresolved rel8 target and push a patch handle.
; Exact syntax still needs design.
jr z, <patch>

; Resolve the top patch to the current location.
.resolve

; Emit a backward branch to the top mark.
jr <mark>
```

These examples are illustrative. They are not final syntax.

## Ops layered over the control stack

The main reason to expose a small control stack is to allow structured assembly
to be built as library-level ops rather than as privileged syntax.

Conceptually:

```asm
op if_z  ( -- patch )
    jr nz, <patch>
end

op then  ( patch -- )
    .resolve
end
```

A loop shape could be built similarly:

```asm
op begin  ( -- mark )
    .mark
end

op again  ( mark -- )
    jr <mark>
end
```

Again, this is design notation, not final AZM syntax. The point is that AZM can
ship primitive control-stack operations and allow disciplined `op`s to build
structured control flow on top.

This gives AZM structured power without making structure magical.

## Layout constants before typed access

The long-term typed features should be split into two categories.

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
- routing layout constants through “typed LD” or EA materialization pipelines

The programmer writes the instructions that calculate **runtime** addresses,
load bytes, store words, and branch. Layout casts only simplify **compile-time**
address constants in those instructions. They must never emit hidden multiply/add
or indexed addressing the programmer did not write.

Implementation should fold casts in the **expression** layer and present plain
fixup operands to instruction emission — not treat casts as a separate lowering
feature. See `docs/design/azm-expression-and-visibility.md`.

## Quarantined procedure-contract research

This section is research, not near-term AZM language surface. Native AZM has no
`func`, formal arguments, locals, generated frames, or module-level function
model. Any future procedure-contract work must start from explicit assembler
metadata and visible instructions, not from compatibility with old ZAX.

The only reason to revisit this area later would be to reduce stack and register
bookkeeping errors while keeping every generated instruction visible and
ordinary. A declaration could document what a subroutine expects, what it
returns, what it clobbers, and what explicit frame layout it uses. It must not
make the Z80 look as though it has native functions.

### Caller-managed frames

If procedure contracts are ever reintroduced, the preferred model should be
caller-managed:

- the caller pushes documented input slots
- the caller allocates documented scratch slots by adjusting `SP`
- the caller executes the `call`
- the caller cleans up the entire frame after return

The callee has no mandatory preamble or postamble in this model. Because the
procedure body pushes nothing solely for frame setup, an unconditional or
conditional `ret` can appear anywhere in the body without an unwind obligation.

On procedure entry, `SP` points at the return address. Input and scratch slots
are then addressed at positive offsets beyond that return address:

```text
SP+0    return address
SP+2    scratch_1
SP+4    scratch_2
...
SP+2n   input_1
SP+2n+2 input_2
...
```

Under this model, scratch and input names are only symbolic names for
caller-allocated frame slots. They must not revive ZAX locals or formal
arguments as native AZM syntax.

### Frame access registers

The Z80 has no general stack-relative addressing mode, so symbolic frame access
needs an index base. AZM should support a small set of explicit patterns rather
than one hidden convention.

The simplest pattern is to burn a register pair. The procedure copies `SP` into a
declared-clobbered register pair and uses that register as the frame base:

```asm
ld  hl, 0
add hl, sp
; symbolic frame references can now lower through helper code based on HL
```

No save or restore is required, and early `ret` remains simple. The cost is that
the procedure contract must declare the chosen register pair as clobbered.

When a frame register such as `IX` or `IY` must be preserved, AZM may generate a
matched save/setup/restore sequence:

```asm
push iy
ld   iy, 0
add  iy, sp
; body using IY-relative access
pop  iy
ret
```

This shifts frame offsets and introduces a real postamble requirement. AZM can
support this mode, but it should be visibly different from the caller-managed
early-return-friendly mode because arbitrary mid-body `ret` is no longer safe
unless it goes through the restore path.

The third pattern is to declare the frame register volatile and leave
preservation to the caller. For example, a procedure can declare `IY` clobbered,
use it freely for frame access, and retain unconditional early-return capability.
If the caller cares about `IY`, the caller saves it.

### Procedure declaration shape

The exact syntax is still open, but the declaration should describe the whole
interface in one place:

```asm
proc foo(arg1, arg2 ; local_x, local_y) returns(a, hl) clobbers(iy)
```

This notation is illustrative only. The semicolon form sketches a possible way
to distinguish initialized input slots from scratch slots in one caller-managed
frame. It must not be implemented as ZAX `func` arguments or locals.

Plain subroutines remain unchanged. A programmer can still write `call label`,
`jp label`, raw `ret`, and hand-managed stack code. A procedure declaration adds
symbolic frame names, call-site validation, and documented contracts; it should
not make a normal machine-level call surprising.

### Register returns and clobbers

Register contracts should be explicit and checkable. Each register is in one of
three states with respect to a declared procedure:

| State     | Declared in     | Meaning                                                         |
| --------- | --------------- | --------------------------------------------------------------- |
| Returned  | `returns(...)`  | Contains a meaningful output value on exit and may be modified. |
| Clobbered | `clobbers(...)` | Modified as a side effect; callers preserve it if needed.       |
| Preserved | unlisted        | Guaranteed unchanged on return.                                 |

Return registers are implicitly volatile. A declaration such as:

```asm
proc add16(val1, val2) returns(hl)
```

says that `HL` is the output. A declaration such as:

```asm
proc foo(arg1 ; local_x) returns(a) clobbers(iy, de)
```

says that `A` is the output and that `IY` and `DE` are side effects the caller
must account for. Registers in neither list are promised preserved.

AZM can use this contract at two levels. First, a strict or lint mode can warn if
the procedure body modifies a register that is not listed as returned or
clobbered. Second, call sites can be annotated with caller preservation choices:

```asm
call foo preserve(bc, de)
```

The exact enforcement model is open, but the intent is clear: register-management
mistakes should become assembly-time diagnostics where possible, not delayed
runtime failures.

### Transparency requirement

Any code AZM generates for procedure calls, frame allocation, preambles,
postambles, or cleanup must be completely transparent:

- generated code must be equivalent to code an experienced Z80 programmer would
  write manually
- listings should be able to show generated instructions for inspection
- generated setup should be opt-in through declarations or annotations
- nothing should happen that changes the programmer's mental model of the stack,
  registers, or machine call instruction

This is the key difference from resurrecting old ZAX `func` semantics. AZM may
reuse proven mechanics only if the abstraction stays in declarations,
validation, and symbolic naming. The machine remains visible.

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

1. Should control-stack primitives use dotted directives, a new `@` prefix, or a
   namespaced directive form?
2. How should an `op` declare its control-stack effect?
3. Should directive aliases be fixed, configurable, or mode-dependent?
4. How strict should `.azm` become over time after the first hard-removal
   boundary is in place?
5. How much of the existing ZAX `op` implementation can be reused without
   reintroducing old high-level assumptions?
6. What is the smallest branch/fixup primitive set that can express useful
   `if`/`then`, `if`/`else`/`then`, `begin`/`again`, and `begin`/conditional
   loop patterns?
7. Should procedure-contract research remain out of alpha entirely, and if it
   returns later, what syntax names input and scratch frame slots without
   reviving ZAX arguments or locals?
8. Should call-site `preserve(...)` annotations be required, optional, lint-only,
   or inferred from explicit save/restore code?
9. How should listings display generated procedure frame setup, preambles,
   postambles, and call-site cleanup?
10. Should strict native mode diagnose procedure bodies that modify unlisted
    registers?
11. If procedure declarations return later, how do they interact with textual
    `.include`? Cross-file visibility and ZAX-style modules are deferred.
12. Should `IX` and `IY` be symmetrical frame-register choices, or should AZM
    recommend one as the native convention?

## Near-term recommendation

Preserve the ASM80 baseline as the floor, delete ZAX language features, then
design AZM in this order:

1. rename and reposition project identity around AZM
2. document ASM80 baseline mode versus AZM-native mode
3. implement or formalize directive alias normalization
4. bring back AST ops as the macro replacement
5. design the compile-time control stack before adding built-in structured
   control
6. keep procedure contracts quarantined until there is a separate design that
   does not reintroduce formal arguments or locals
7. add typed memory layout only when its assembler-facing model is clear

The next development step should be a focused design spec for directive aliases,
AST ops, the assembly control stack, and transparent procedure contracts.
Implementation should wait until those interfaces are explicit enough to test.
