# Text-level `include` — Design Candidate

Status: design candidate — not yet implemented
Audience: language designer, course author

---

## What it is

A text-level source inclusion directive that inserts the content of a named
file into the current source at the point of the directive, before any further
processing. The result is as if the included file's text had been written
directly in the including file at that position.

This is analogous to the C preprocessor `#include` directive. It operates at
the source-text level, before the parser sees the combined result.

---

## How it differs from ZAX module `import`

ZAX already has a module system with `import`. Text-level `include` is a
different mechanism with a different purpose:

| Property | `import` | `include` |
|---|---|---|
| Mechanism | compiler-managed module resolution | literal source-text insertion |
| Type system involvement | yes — exported symbols carry types; imports are type-checked at the boundary | none — included text is treated as if typed in place |
| Namespace | module-scoped; imported names are qualified or explicitly brought into scope | none — included definitions land directly in the including file's scope |
| Visibility control | exports are declared explicitly | everything in the included file is visible at the include site |
| Intended content | typed interfaces, functions, records, typed storage | constants, EQU-style definitions, raw data tables, ROM entry-point labels |
| Book 1 appropriateness | deferred to Book 2 | candidate for Phase A (Book 1, chapters 00–07) |

`include` is not a simplified version of `import`. They address different
problems. A reader who knows both should use `import` when module boundaries
and type-checking matter, and `include` only for raw shared definitions where
the type system is not involved.

---

## Why it matters for Book 1

Book 1 (the Z80 intro course) teaches raw Z80 in ZAX during Phase A
(chapters 00–07). Phase A examples need to reference hardware constants,
ROM entry-point addresses, and simple platform-specific definitions. On a
specific target platform (for example, a ZX Spectrum), these include things
like:

- memory-map addresses (ROM start, RAM start, display base)
- ROM monitor entry-point labels and their addresses
- hardware port numbers for I/O
- common constants used across multiple early examples

Without `include`, each Phase A example file must either repeat these
definitions at the top of the file, or the author must find a workaround.
Repeating definitions across every example is noisy and maintenance-unfriendly.
Workarounds risk introducing the module system before it has been explained.

With `include`, a single `hardware.zax` file (or equivalent) can be shared
across all Phase A examples with a single directive. The reader sees it as
natural and familiar; the course does not need to explain module boundaries
before the reader understands why they exist.

---

## Proposed syntax

Two candidate forms; do not commit to either until the design decision is made:

```
include "filename.zax"
```

or:

```
#include "filename.zax"
```

The `#include` form is visually familiar to anyone with C background and makes
the preprocessor-like nature of the operation explicit. The `include` form is
cleaner and more consistent with ZAX keyword style.

Both forms should be evaluated. The decision should consider:

- consistency with the rest of the ZAX syntax
- whether `#` is already used or reserved for another purpose
- whether the text-level semantics should be visually distinguished from
  normal language constructs

The filename is a relative path to the included file, resolved from the
including file's location.

---

## Scope of included content

Text-level `include` is intended for files that contain:

- constants and EQU-style definitions
- ROM entry-point labels and address literals
- raw data tables (`db`, `dw`, and similar)
- simple named-address definitions

These are the things early Book 1 chapters need to share. They require no
module boundary, no type-checked interface, and no namespace qualification.

---

## Explicit non-goals

Text-level `include` is not:

- a replacement for `import`. When typed interfaces and compiler-managed
  module boundaries are needed, `import` is the right tool.
- a namespace mechanism. Definitions from an included file land in the
  including scope without qualification.
- a way to share typed function declarations or record type definitions
  across module boundaries. That is `import`'s job.
- a general-purpose code-reuse mechanism. It is a definitions-sharing
  convenience for early, raw-Z80-oriented examples.

Keeping `include` narrow prevents it from becoming a tempting shortcut for
things that belong in the module system.

---

## Status

Design candidate. Not yet implemented.

Prioritise only if early Book 1 chapter drafts clearly produce friction from
repeated constant definitions that cannot be handled without either copying
definitions into every file or introducing `import` before the reader is
ready for it. The decision to implement should be driven by that concrete
evidence, not by speculation about whether it will be needed.

If the friction does not materialise — for example, if Book 1 examples turn
out to need only a small number of definitions that are easy to inline — then
`include` may not be worth implementing for Book 1 alone.

Related planning note: `docs/work/z80-intro-course-plan.md`, open question 3.
