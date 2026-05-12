# Z80 Programming with ZAX — Reader Model and Course Direction

Status: active design brief
Audience: course author, contributors, reviewers

Related operational brief: `docs/work/course-program-plan.md`

## Purpose

This document defines the new teaching direction for ZAX.

The key change is simple:

- the existing algorithms course is **not** the right first book
- it should be treated as the second-stage volume
- a new beginner-facing volume should teach Z80 programming **through ZAX** from
  the beginning

The goal is to make ZAX the normal way a new reader learns assembly-language
programming on this machine family, rather than an optional layer added after
they already know a conventional assembler.

## Reader profiles

There are three distinct readers:

### 1. Beginner to low-level programming

This reader may know only basic computing ideas.
They do **not** necessarily know:

- what a register is
- what the flags are
- what the stack is
- what a memory map is
- how machine code and assembly language relate

This reader needs conceptual scaffolding before they can benefit from an
algorithms-first book.

### 2. Hobbyist / retro learner

This reader may know some BASIC, C, Python, Arduino-style programming, or
general hobby electronics, but not disciplined Z80 assembly work.

They want:

- a machine-level mental model
- practical programming examples
- a path from simple instruction sequences to larger programs

This reader is a strong candidate for a beginner-facing ZAX volume.

### 3. Existing Z80 or assembly programmer

This reader already understands:

- registers
- flags
- addressing modes
- control flow
- subroutines

They want to learn ZAX specifically.

The current algorithms course fits this reader well.

## Primary reader decision

The beginner-facing volume should be calibrated primarily for:

- the hobbyist / retro learner with limited prior low-level experience

This reader is not assumed to know Z80 assembly, but is assumed to be able to
follow a practical machine-level explanation without requiring a full
computer-science-from-zero treatment.

The absolute beginner remains a supported secondary reader, but not the pacing
baseline. This matters for tone:

- concepts must still be introduced clearly and progressively
- but the prose can assume curiosity, patience, and some prior exposure to
  programming ideas
- the volume should not expand into a general introduction to all computing

That is the best compromise between accessibility and momentum.

## Teaching arc for Volume 1

The beginner-facing volume should now be planned around a deliberate two-phase
arc:

### Phase A — raw-first Z80 programming in ZAX

Start with the machine-facing subset of the language:

- raw mnemonics
- constants
- labels
- raw jumps and calls
- `db`, `dw`, and simple data layout
- loops built from branch instructions and hardware primitives such as `djnz`

The student needs to feel the bookkeeping cost of these raw forms before the
structured ZAX features can make persuasive sense.

### Phase B — structured ZAX as justified relief

Only after the reader has written and followed raw control flow should the book
introduce:

- `if` as relief from label-heavy conditional blocks
- `while` as relief from manual loop heads and back-edges
- typed storage and `:=` as relief from handwritten offset bookkeeping
- `step` as relief from scalar update shuttling
- locals, parameters, and `op` after the raw calling and repetition model are
  already understood

The key rule is simple:

- do not introduce an abstraction before the reader can feel the problem it is
  solving

## Core decision

The teaching program should now be split into two volumes:

### Volume 1 — Learn Z80 Programming in ZAX

This is the beginner-first book.

Its planned output location is:

- `learning/part1/`

It should teach:

- what a computer is doing
- bytes and two's complement
- registers and register pairs
- flags
- memory, ROM, RAM, addresses, and memory maps
- labels and raw instruction flow
- branches and loops
- stack, calls, returns, and subroutines
- ports, I/O, and restart instructions
- raw data and simple low-level layout
- then, only after the raw forms have been used enough to feel awkward, the
  structured power of ZAX

ZAX should be presented here as the **correct assembler surface** for learning
and writing this style of code, not as an advanced alternative layered on top of
some other "real" assembler.

### Volume 2 — Algorithms and Data Structures in ZAX

This is the current `learning/part2/` material.

It should stay focused on:

- substantial programs
- data structures
- algorithmic expression
- language ergonomics and friction

It assumes the reader already understands the basic machine model.

## Why the split matters

Without the split, the current course has the wrong opening assumptions.

Its introduction currently answers:

- what ZAX is
- why the algorithm corpus matters
- what the structured assembler bargain is

But a beginner reader needs earlier questions answered first:

- what is a register?
- what is a flag?
- why does the CPU branch?
- what is the stack doing?
- what is memory-addressed I/O?

That is why the current course reads as if it starts in the middle. The problem
is not the examples. The problem is the target reader.

## Position of the current course

The current course should be explicitly repositioned as:

- the algorithms volume
- the second-stage companion
- not the first introduction to programming or the Z80

This preserves the value of the existing work while making room for the correct
beginner-facing teaching path.

## Specific planning consequences

Several concrete consequences follow from this teaching direction:

1. Raw label and jump support is a hard prerequisite for Book 1. The early
   chapters need clean support for user-defined labels with forms such as `jp`,
   `jr`, `djnz`, and `call`.
2. `djnz` should be treated as the natural counted-loop entry point. Its real
   zero-count hardware behaviour is a teaching advantage, and it helps justify
   why any future structured `for` loop must have different zero-trip semantics.
3. `repeat ... until` is not automatically part of the Book 1 surface. It
   should only appear if the example corpus produces a clear must-run-once case
   where it is better than `while`.
4. A structured `for` loop remains deferred. The beginner volume may mention the
   idea, but must not present it as an implemented surface.
5. A text-level `include` is now a tracked candidate language addition for the
   beginner course. It serves a different teaching purpose from the existing
   module `import` system and may be needed for early constant and definition
   sharing.

## Implications for the language

This direction does **not** automatically imply new language features.

First question:

- can the beginner-facing volume be written cleanly with the current raw and
  structured surfaces?

Most likely:

- yes, mostly
- but it may expose rough edges in the raw-first teaching path
- one concrete candidate already identified is a text-level `include` facility
  for early-book constant and definition sharing

So the right sequence is:

1. define the beginner volume
2. outline its chapters and example style
3. then judge whether any language gaps are blocking it

Do not assume the language must change before the teaching plan is clear.

## Immediate documentation consequences

The docs should now reflect:

- `learning/part2/` is the algorithms volume
- the beginner-facing volume is planned but not yet written
- existing algorithms planning docs should be described as Volume 2 material

## Next planning steps

1. Produce an operational authoring plan for Volume 1.
2. Define the chapter skeleton for the beginner volume.
3. Audit the current language/docs for rough edges in raw-first teaching.
4. Keep the current algorithms course intact, but reposition it consistently as
   the second-stage course.
