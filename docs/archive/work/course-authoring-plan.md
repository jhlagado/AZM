# ZAX Algorithms Course Authoring Plan

Status: active writing brief for the algorithms/data-structures volume
Audience: course author, writer, editor

## Purpose

This document consolidates the current writing plan for the **algorithms
volume** into one operational brief. It is the canonical handoff for
prose-first writing of the existing `learning/part2/` material.

Use this document together with the current example sources. Do not reconstruct the
course shape from scattered design notes.

This document does **not** define the planned beginner-facing "Learn Z80
Programming in ZAX" volume. That planning now lives separately.

Writers and reviewers must use `docs/work/course-writing-standard.md` as the
editorial gate for all new or revised prose in this volume.

## Canonical sources

Use these as the authority for course planning and current syntax:

- `docs/design/z80-programming-with-zax.md` — broader two-volume teaching direction and reader model
- `docs/design/zax-algorithms-course.md` — course rationale, goals, style direction
- `docs/work/course-writing-standard.md` — mandatory editorial and review standard for all course prose
- `docs/spec/zax-spec.md` — normative language surface
- `docs/reference/ZAX-quick-guide.md` — practical syntax reference
- `learning/part2/examples/` — canonical course example corpus on `main`

Important warning: `docs/design/zax-algorithms-course.md` still contains old `move`-era
examples and wording in some sections. Use it for rationale and course intent, not as a
syntax model. For actual language surface, current `main` examples plus the spec and quick
guide are authoritative.

The beginner-facing introductory volume is now planned separately. This document
only governs the current algorithms/data-structures volume under `learning/part2/`.

If older design prose disagrees with the current examples/spec/reference, the current
examples/spec/reference win.

## Current language assumptions for the course

This algorithms volume should assume the current active surface on `main`:

- `:=` is the assignment surface
- scalar path-to-path `:=` is available
- `step` is available for typed scalar paths and should be explained as the language-level scalar update form
- `break` / `continue` are available
- `for` is deferred and must not be presented as part of the active course surface

Why `for` is deferred: current course examples are intentionally written with `while`, `break`, and `continue` because that is the settled, implemented loop surface on `main`. Do not imply that bounded iteration currently has a first-class `for` form.

`include` is part of the language surface (shipped PR #951). Key facts for the writer:

- `include "path"` performs a literal pre-parse text insertion. It has no module semantics.
- It is not a module mechanism. It creates no qualified names, no module graph edges, no export relationships.
- Including the same file twice inserts the text twice. There are no include-once semantics.
- Preferred use: shared hardware constants, shared op definitions, repeated low-level definitions that are implementation detail rather than public API.
- Not preferred for: program logic, API-style module boundaries, anything that wants exports or qualified names.
- Teaching order: introduce `import` first when multi-file composition is introduced. Introduce `include` immediately after, as an explicit contrast. Do not introduce `include` before `import`.

Do not use older `move`-era prose as teaching guidance.

## Course output location

All prose course material should live under:

- `learning/part2/`

Recommended file set:

- `learning/part2/README.md`
- `learning/part2/00-introduction.md`
- `learning/part2/01-foundations.md`
- `learning/part2/02-arrays-and-loops.md`
- `learning/part2/03-strings.md`
- `learning/part2/04-bit-patterns.md`
- `learning/part2/05-records.md`
- `learning/part2/06-recursion.md`
- `learning/part2/07-composition.md`
- `learning/part2/08-pointer-structures.md`
- `learning/part2/09-gaps-and-futures.md`

## Unit mapping

Chapter numbers are offset from example unit numbers because `00-introduction.md` is a course introduction chapter, not an example unit.

- Chapter `00` = course introduction
- Chapter `01` maps to `learning/part2/examples/unit1/`
- Chapter `02` maps to `learning/part2/examples/unit2/`
- ...
- Chapter `09` maps to `learning/part2/examples/unit9/`

## Current example inventory on `main`

This authoring brief is tied to the currently checked-in example corpus.
Do not assume there are additional course examples beyond the files listed below.

- `learning/part2/examples/unit1/` — 7 examples
- `learning/part2/examples/unit2/` — 6 examples
- `learning/part2/examples/unit3/` — 7 examples
- `learning/part2/examples/unit4/` — 4 examples
- `learning/part2/examples/unit5/` — 1 example
- `learning/part2/examples/unit6/` — 3 examples
- `learning/part2/examples/unit7/` — 1 lesson example plus 1 support module
- `learning/part2/examples/unit8/` — 2 examples
- `learning/part2/examples/unit9/` — 1 example

Practical implication for the writer:

- `unit5/` is intentionally a single-example chapter built around `ring_buffer.zax`
- `unit7/word_stack.zax` is support code, not a separate lesson
- `unit9/` is a capstone chapter centered on `eight_queens.zax`, not a multi-example survey unit

### 00 Introduction

Purpose:

- explain what ZAX is
- explain what this course is and is not
- explain the audience and assumptions
- explain why the course is organized around algorithms rather than features

### 01 Foundations

Purpose:

- establish the basic voice of ZAX through arithmetic, iteration, and small helper routines
- show assignment, scalar locals, and structured control before arrays and records

Examples:

- `learning/part2/examples/unit1/digits.zax`
- `learning/part2/examples/unit1/exp_squaring.zax`
- `learning/part2/examples/unit1/fibonacci.zax`
- `learning/part2/examples/unit1/gcd_iterative.zax`
- `learning/part2/examples/unit1/gcd_recursive.zax`
- `learning/part2/examples/unit1/power.zax`
- `learning/part2/examples/unit1/sqrt_newton.zax`

### 02 Arrays and Loops

Purpose:

- show indexed storage, loop structure, and small algorithmic invariants over arrays
- introduce the strongest early examples of `step` and `break` / `continue` in ordinary search and sort code
- explicitly explain `break` and `continue` in this chapter, because this is where the reader first sees them as part of ordinary loop structure

Examples:

- `learning/part2/examples/unit2/insertion_sort.zax`
- `learning/part2/examples/unit2/bubble_sort.zax`
- `learning/part2/examples/unit2/selection_sort.zax`
- `learning/part2/examples/unit2/binary_search.zax`
- `learning/part2/examples/unit2/linear_search.zax`
- `learning/part2/examples/unit2/prime_sieve.zax`

### 03 Strings

Purpose:

- show pointer-like traversal over byte arrays and zero-terminated data
- explain where ZAX stays close to Z80 in raw memory-walking code

Examples:

- `learning/part2/examples/unit3/strlen.zax`
- `learning/part2/examples/unit3/strcpy.zax`
- `learning/part2/examples/unit3/strcmp.zax`
- `learning/part2/examples/unit3/strcat.zax`
- `learning/part2/examples/unit3/str_reverse.zax`
- `learning/part2/examples/unit3/atoi.zax`
- `learning/part2/examples/unit3/itoa.zax`

### 04 Bit Patterns

Purpose:

- show bitwise algorithms where the machine model is very visible
- keep the prose focused on algorithm shape rather than opcode-by-opcode narration

Examples:

- `learning/part2/examples/unit4/popcount.zax`
- `learning/part2/examples/unit4/bit_reverse.zax`
- `learning/part2/examples/unit4/parity.zax`
- `learning/part2/examples/unit4/getbits.zax`

### 05 Records

Purpose:

- show typed aggregate state and field-oriented update in a compact example
- explain how records change the feel of low-level code without hiding the machine

Inventory note:

- this chapter currently has one canonical example on `main`
- do not invent extra example references here unless the corpus actually grows later

Examples:

- `learning/part2/examples/unit5/ring_buffer.zax`

### 06 Recursion

Purpose:

- show recursive decomposition and argument/local discipline over the IX frame model
- make the prose focus on structure and invariants, not just call mechanics

Examples:

- `learning/part2/examples/unit6/hanoi.zax`
- `learning/part2/examples/unit6/array_sum_recursive.zax`
- `learning/part2/examples/unit6/array_reverse_recursive.zax`

### 07 Composition

Purpose:

- show how larger behavior emerges from helper routines, typed storage, and a support module
- keep the lesson centered on the calculator example, not the helper internals

Examples:

- main lesson: `learning/part2/examples/unit7/rpn_calculator.zax`
- support module reference only: `learning/part2/examples/unit7/word_stack.zax`

`word_stack.zax` is not a standalone lesson chapter. It is support code that the prose may reference briefly when explaining how the calculator is assembled.

When `import` is introduced in this chapter, contrast it with `include` explicitly.
Use the contrast to establish the distinction once, clearly, so the reader understands
both mechanisms and when to reach for each. The contrast paragraph should appear after
`import` is explained, not before.

### 08 Pointer Structures

Purpose:

- show linked and tree-shaped data with explicit addresses, casts, and traversal
- explain both what works well and what still feels verbose in pointer-heavy ZAX

Examples:

- `learning/part2/examples/unit8/linked_list.zax`
- `learning/part2/examples/unit8/bst.zax`

### 09 Gaps and Futures

Purpose:

- use `eight_queens` as the capstone reading for control-flow pressure and design limits
- explain which parts of the program are now clearer because of `break` / `continue`
- connect the example back to the friction log and future language/library questions without turning the chapter into a roadmap dump

Inventory note:

- this chapter is intentionally centered on one example file, not a bundle of smaller examples

Examples:

- `learning/part2/examples/unit9/eight_queens.zax`

## Writing model

The algorithms volume must be prose-oriented.

It is not:

- a reference manual
- a Z80 tutorial
- a sequence of full source listings with light commentary

It is:

- an algorithm-driven explanation of how ZAX expresses real programs
- a guided reading of the example corpus
- an editorial layer over the source files

### Per-chapter structure

Each chapter should generally contain, in this order:

1. a short opening overview
2. several prose sections grouped by problem family
3. a short `What this unit teaches about ZAX` section
4. an `Examples in this unit` list with file references
5. suggested exercises or modifications

Short code excerpts should be embedded where they materially help the prose. They are supporting material, not a standalone section and not a substitute for explanation.

### Per-example treatment

For each substantial example, prefer this sequence:

1. state the problem in plain language
2. explain the data model used in ZAX
3. explain the control-flow shape
4. explain the main ZAX idioms used
5. note any pressure points or awkwardness honestly
6. point the reader to the full source file

### Excerpt policy

Use short code excerpts.
Do not dump entire source files into the course.

Excerpts should support the prose, not replace it.

## Tone and style rules

The prose should be:

- clear
- deliberate
- explanatory
- concrete

The prose should not be:

- chatty
- tutorialized down to instruction-by-instruction narration
- overloaded with reference-style syntax detail

Comments about instructions should explain algorithmic purpose, invariants, or
structure, not what a single opcode does.

## Constraints for the writer

- use current syntax only
- do not teach `for`
- do not revive `move`
- do not introduce speculative language features as if they already exist
- do not copy old design-doc examples without checking current `main`
- do not treat support files such as `word_stack.zax` as standalone lessons unless
  the prose explicitly frames them as support material
- use `import` for module composition; use `include` only for shared constant,
  type, or op definitions that do not need export or qualified names
- do not introduce `include` before `import` — `import` is the module mechanism
  and must be established first so the contrast is meaningful
- do not add `.inc` files to the example directories until a concrete shared-
  definition need emerges from the actual example corpus

## Phased writing plan

### Phase 1

Write these first:

- `learning/part2/README.md`
- `learning/part2/00-introduction.md`
- `learning/part2/01-foundations.md`
- `learning/part2/02-arrays-and-loops.md`

This phase is the style and structure checkpoint.
Do not write the rest of the course before this phase is reviewed.

Specific requirement for phase 1:

- `learning/part2/02-arrays-and-loops.md` must explicitly explain `break` and `continue` as part of the loop discussion, using current course examples rather than abstract syntax-only prose.

### Phase 2

Write:

- `learning/part2/03-strings.md`
- `learning/part2/04-bit-patterns.md`
- `learning/part2/05-records.md`
- `learning/part2/06-recursion.md`

### Phase 3

Write:

- `learning/part2/07-composition.md`
- `learning/part2/08-pointer-structures.md`
- `learning/part2/09-gaps-and-futures.md`

For `09-gaps-and-futures.md`, connect `eight_queens` and the pointer/composition units back to real design pressure recorded in `docs/design/`.

### Phase 4

Editorial pass:

- consistency of tone
- cross-links between chapters
- example-file references checked
- syntax surface checked against `main`

## Writer handoff summary

The writer should be told:

- the output is a prose-first course under `learning/part2/`
- phase 1 is the first deliverable
- current examples on `main` are the source truth for what is being taught
- `for` is deferred and must stay out of the active teaching surface
- review should happen after phase 1 before the full course is drafted
