# Learn Z80 Programming in ZAX — Course Plan

Status: planning brief
Audience: course author, writer, reviewer

## Purpose

This document is the operational planning brief for the planned beginner-facing
volume:

- **Learn Z80 Programming in ZAX**

It is the first-stage course.

The existing `learning/part2/` material remains the second-stage algorithms volume.

Planned output location:

- `learning/part1/`

Mandatory companion standard:

- `docs/work/course-writing-standard.md`
- `docs/work/platform-course-strategy.md`

---

## Target Reader

Primary reader:

- the hobbyist / retro learner with limited prior low-level experience

Secondary reader:

- the determined absolute beginner

The volume should therefore assume:

- little or no Z80 knowledge at the start
- little or no assembly-language experience
- some willingness to learn technical concepts progressively
- interest in understanding how programs run at the machine level

The course should therefore teach:

- machine model first
- assembly reasoning second
- structured ZAX features gradually, and only after raw friction is felt

All draft prose for this volume must satisfy the stricter editorial criteria in
`docs/work/course-writing-standard.md`.

---

## Teaching Principle

**First show the raw problem. Then show the ZAX relief. Never introduce
abstraction before the reader can feel the need for it.**

Every structured ZAX construct introduced in Phase B must be preceded — in
Phase A — by a raw Z80 version of the same problem that makes the pain visible.
The reader must arrive at Phase B already dissatisfied with what Phase A
required. If the reader is not dissatisfied, the abstraction has not earned
its place.

This principle governs every chapter that introduces a structured construct.
If a structured form cannot be justified by felt friction from a prior raw
version, it is introduced too early.

---

## Learning Outcomes

By the end of Volume 1, the reader should be able to:

- explain bytes, words, addresses, ROM, RAM, and memory maps
- explain two's complement and flag behaviour
- use the Z80 register set and register pairs
- write small loops, branches, and subroutines in raw Z80
- understand stack use and call/return discipline
- read and write small raw assembly routines in ZAX
- understand why and when to use structured ZAX features:
  - typed storage and `:=`
  - `if` / `else`
  - `while`
  - `break` / `continue`
  - `step`
  - functions with arguments and locals
  - `op`
- understand what module `import` is and why it is a Book 2 topic
- understand what `include` is, how it differs from `import`, and when each is appropriate

At that point the reader is ready for the algorithms volume.

---

## Two-Phase Structure

Book 1 is organised in two phases inside a single volume.

### Phase A — Raw-first Z80 in ZAX (chapters 00–07)

Phase A programs are almost entirely raw Z80. ZAX is present as the assembler
surface — the file structure, label scoping, constant definitions, the `call`
and `ret` forms — but the program content is Z80 mnemonics: `ld`, jumps,
arithmetic operations, flag tests, stack manipulation, and DJNZ.

Phase A teaches:

- bytes, words, registers, flags, and the memory map
- labels and EQU-style constants
- raw Z80 instructions: `ld`, `add`, `sub`, `and`, `or`, `cp`, `xor`,
  `bit`, `res`, `set`, `rl`, `rr`, `sla`, `sra`
- conditional and unconditional jumps: `jp`, `jr`, `djnz`, flag conditions
- the hardware stack: `push`, `pop`, stack discipline
- `call`, `ret`, `ret cc` and raw subroutine structure
- DJNZ as the counting-loop primitive in Book 1
- simple data tables: `db`, `dw`, indexed access via HL and IX
- flag discipline: Z, C, S, P/V — how to read them and use them

The reader is writing Z80 programs that live in ZAX files. The ZAX module
shell is present but almost invisible. By chapter 07 the reader has written
real programs; they have also accumulated enough raw friction to want relief.

### Phase B — Structured ZAX as improvement (chapters 08–10)

Phase B introduces the ZAX structured surface. Each construct is introduced
after Phase A has produced a version of the same problem that is visibly
awkward. The reader should already want what Phase B provides.

Phase B introduces:

- typed locals and local variable declarations
- function arguments in the ZAX style
- typed storage and `:=` as the assignment surface
- `step` for typed scalar update
- `if` / `else` replacing manual flag-test-and-jump sequences
- `while` replacing manual loop-label structures
- `break` / `continue` for loop escape and continuation
- `op` as a lightweight named-operation construct

Phase B does not hide the machine. Every construct maps to Z80 output the
reader can inspect. The structured layer is a readability and maintainability
improvement, not an opaque abstraction.

---

## Deferred to Phase B or Book 2

The following constructs must not appear in Phase A chapters. This table is
the hard boundary. Its purpose is to prevent scope creep and to give the
author a clear line.

| Construct | Deferred to | Note |
|---|---|---|
| typed locals and local variable declarations | Phase B | |
| function arguments (ZAX style) | Phase B | |
| typed storage and `:=` | Phase B | |
| structured control flow (`if`, `while`) | Phase B | |
| `step` | Phase B | |
| `break` / `continue` | Phase B | introduce after `while` |
| `op` | Phase B or Book 2 | depending on depth needed |
| module `import` system | Book 2 | |
| `for` loop | Book 2 or later | see note below |
| `repeat...until` | Phase B or Book 2 | see note below |
| text-level `include` | Phase B or Book 2 | shipped (PR #951); teach after `import`, not before — see teaching rule below |

### Note on `for`

`for` is deferred. DJNZ is the counting-loop primitive in Book 1. Phase A
teaches DJNZ as the canonical bounded-iteration form for Z80 programs. Phase B
teaches `while` with explicit termination as the structured replacement where
needed. The `for` construct will come later, when the language has it and the
reader has enough `while` experience to appreciate the narrower form. Do not
present `for` as part of the current teaching surface.

### Note on `repeat...until`

`repeat...until` is in the language and is not being removed. It should not,
however, be placed in the core Phase A or Phase B loop plan. Introduce it in
Book 1 only if a later chapter produces a genuinely clear natural example
where it is better than a `while` with a leading flag test. If no such example
appears organically, leave `repeat...until` for Book 2. Do not force an
example to justify early introduction.

### Teaching rule: `import` and `include`

When multi-file composition is introduced (Phase B or Book 2), teach `import`
first. Introduce `include` immediately after, as an explicit contrast.

The contrast must make these distinctions clear:

- `import` creates a module relationship: qualified names (`dep.Symbol`),
  export rules, circular-import detection, deterministic module order.
- `include` is a literal pre-parse text paste: the included text is inserted
  into the including file before parsing begins.
- `include` has no module semantics. There are no qualified names, no export
  rules, no module graph.
- Including the same file twice inserts the text twice. There are no
  include-once semantics unless the programmer builds them manually.
- `import` is the right tool for program logic, API-style module boundaries,
  and anything that wants exports or qualified names.
- `include` is the right tool for shared hardware constants, shared op
  definitions, and repeated low-level definitions that are implementation
  detail rather than public API.

Do not introduce `include` before `import`. A reader who learns `include`
first will try to use it as a module system, which it is not.

---

## Chapter Skeleton

The chapter list below maps the Phase A / Phase B split explicitly. Chapter
numbers and topics are the current plan; titles are working titles.

### Phase A — Raw Z80 in ZAX (chapters 00–07)

**Chapter 00 — Machine Code and the Assembler**
- machine code vs assembly language
- bytes and words; memory as addressed storage
- code vs data; ROM vs RAM
- what ZAX is and what it adds to raw assembly
- a first minimal ZAX file: the module shell around a bare entry point

**Chapter 01 — Numbers and the Z80 Register Set**
- unsigned vs signed interpretation; binary and hexadecimal
- two's complement; overflow intuition
- the Z80 registers: A, B, C, D, E, H, L, and the register pairs
- HL as the common working pair; IX, IY, SP, PC at a conceptual level
- why flags matter; Z, C, S, P/V in the flag register

**Chapter 02 — Loading, Storing, and Simple Constants**
- raw `ld` in all its addressing modes
- labels as named addresses and named storage
- EQU-style constants and hardware address names
- first small data-moving programs written in ZAX

**Chapter 03 — Flags, Comparisons, and Jumps**
- `cp`, `or a`, and arithmetic-driven flag tests
- `jp`, `jr`, and conditional jump forms
- structured thinking with labels: entry, test, body, exit
- example: a decision-loop using raw flag tests and explicit jumps

**Chapter 04 — Counting Loops and DJNZ**
- DJNZ as the counting-loop primitive for Book 1
- loop structure with explicit labels: init, body, branch-back
- sentinel loops and flag-exit loops
- raw `while`-equivalent patterns using labels and jumps
- example: counted iteration and sentinel iteration side by side

**Chapter 05 — Data Tables and Indexed Access**
- `db`, `dw` and in-ROM data tables
- HL-based and IX-based indexed access
- reading a table entry in a loop
- example: a table-lookup program using raw indexed addressing

**Chapter 06 — Stack and Subroutines**
- `call`, `ret`, `ret cc`: mechanics of subroutine calls
- passing values through registers: the Z80 calling convention
- the hardware stack: `push`, `pop`, stack depth discipline
- saving and restoring registers around calls
- example: a small program with helper subroutines using raw `call`/`ret`

**Chapter 07 — I/O and Ports**

Covers the Z80 I/O address space, `in` and `out` instructions, immediate and register-addressed port forms, and abstract port numbers.

**Chapter 08 — A Phase A Program**
- a complete program using only Phase A constructs
- explicit label structure, DJNZ loops, raw calls, flag-conditional jumps
- reading and understanding the Z80 output
- honest review: where the raw approach is direct and where it is
  laborious
- the laborious parts are left as deliberate entry points for Phase B

---

### Phase B — Structured ZAX (chapters 08–10)

**Chapter 09 — Typed Storage and Assignment**
- what typed storage is and why Phase A programs avoided it
- local variable declarations and `:=` as the assignment surface
- `step` as the language-level scalar update form
- why `:=` is not just `ld`: what the type system checks
- rewriting a Phase A example with typed storage: what improves, what
  costs more, what stays the same

**Chapter 10 — Structured Control Flow**
- `if` / `else` as a replacement for flag-test-and-jump sequences
- `while` as a replacement for manual loop-label structures
- `break` and `continue` for loop escape and continuation
- comparing the Phase A and Phase B versions of the same loop side by
  side
- example: a Phase A program rewritten using `if` and `while`

**Chapter 11 — Subroutines, Arguments, and `op`**
- function arguments in the ZAX style: named parameters, passing discipline
- `op` as a named-operation construct: lightweight, close to assembly
- when to use `op` and when to use a full function declaration
- a Phase B program that integrates typed storage, structured control flow,
  and named subroutines
- honest assessment: what ZAX costs vs raw assembly and what it buys

---

## Relationship to Volume 2 (Algorithms Course)

Volume 2 (`learning/part2/README.md`, grounded by
`docs/design/zax-algorithms-course.md`) assumes the reader can write ZAX
programs at the Phase B level. It does not re-teach ZAX syntax or Z80
mechanics. It uses the full structured surface immediately — typed storage,
`:=`, `if`, `while`, `break`, `continue`, `step` — as a given.

Book 1 is the prerequisite for Volume 2. A reader who has completed Book 1
through Chapter 11 should be able to open any Volume 2 example and follow it
without encountering unfamiliar ZAX constructs.

The module `import` system appears in some Volume 2 examples (for example, the
RPN calculator's `word_stack` module). Book 1 prepares the reader for `import`
by naming it and explaining that it is a separate concept from text-level
inclusion, then deferring its full treatment.

`include` is also available as a language feature (shipped PR #951). It is not
a module mechanism. It performs a literal pre-parse text insertion with no
module graph involvement, no qualified names, and no include-once semantics.
Book 1 may name it when introducing `import`, as a contrast, and leave both for
deeper treatment in Volume 2.

---

## Example Style Guidance

Book 1 examples should:

- be complete programs that compile and produce inspectable Z80 output
- target a generic Z80 execution model rather than a specific machine ROM
- demonstrate results through register state, memory state, listings, or binary
  output rather than through a platform-specific screen or monitor API
- be shorter than Volume 2 examples — concept scaffolding, not maximal
  density
- in Phase A: look like real Z80 programs that happen to live in a ZAX file
- in Phase B: look like ZAX programs that happen to run on a Z80

Phase A examples should use raw mnemonics throughout. Phase B examples should
show the structured forms and include explicit comparison with their Phase A
counterparts where this illuminates the improvement.

---

## Settled prerequisites

**Target hardware platform**

Book 1 will use a generic / abstract Z80 target rather than a specific machine
ROM or monitor environment.

That means:

- Phase A examples stay platform-neutral
- examples demonstrate behaviour through register state, memory state, and
  generated output rather than machine-specific screen or ROM calls
- the reader is free to load the same examples into any Z80 system or emulator
  they prefer

This weakens the immediate need for shared hardware-definition files in Phase A.
It also means the text-level `include` design remains a candidate convenience,
not a prerequisite for starting the book.

**Raw label/jump support**

The raw-control-flow prerequisite has been smoke-tested and confirmed for
user-defined labels with:

- `jp`
- `jr`
- `djnz`
- `call`

These forms compile cleanly in ZAX and are safe to use in the early raw-first
chapters.

## Open Planning Questions

The following questions remain open. They do not block the first tranche, but
should be revisited as the book grows.

**1. Compiler output format**

Phase A examples should produce inspectable Z80 output. The author needs to
know what format Book 1 targets operationally in the prose (raw binary, Intel
HEX, listing file, or some combination). This affects how example programs are
presented and verified.

**2. Text-level `include` directive — SETTLED**

`include "path"` shipped in PR #951. It is not a design candidate; it is
implemented and in spec §3.1.1.

Settled decisions for Book 1:

- `include` is not needed for Phase A. Phase A examples are short, single-file,
  and platform-neutral. No shared hardware definitions file is required.
- `include` is deferred to Phase B or Book 2, taught after `import`, not before.
- Teaching rule: when `import` is introduced, contrast it explicitly with
  `include`. See the teaching rule section below.
- Do not add `.inc` files to Book 1 example directories until the platform
  story is settled and a concrete shared-definition need emerges from the
  actual example corpus.

**3. Phase A / Phase B balance**

The current split puts eight chapters in Phase A and three in Phase B. Review
this balance after Chapter 07 is drafted to confirm that Phase B is not rushed
and that each Phase B construct has a clear Phase A predecessor to justify it.

**4. How much raw data syntax before typed storage becomes the default?**

The transition point between raw `db`/`dw` and typed storage is a teaching
decision. Phase A establishes raw data layout; Phase B introduces typed
storage. The author should flag examples where the boundary feels unnatural.

**6. Glossary and reference appendix**

Book 1 may need a Z80 register/flag reference and a ZAX syntax summary as
appendices. These are production decisions. Flag for the editor when chapter
drafts reach review.
