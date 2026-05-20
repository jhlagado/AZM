# AZM Code Quality Standard

Status: active contributor reference

## Purpose

AZM should become smaller, clearer, and easier to maintain as the inherited ZAX
surface is retired. This document defines the code-quality standard for that
work.

The standard is not about style polish for its own sake. It is about keeping an
assembler codebase honest: each subsystem should have a narrow job, source files
should be easy to inspect, and retained complexity should have an explicit
reason.

## Baseline Principle

Prefer the simplest structure that preserves the real compiler boundary.

AZM is an assembler. It needs parsing, semantic checks, lowering, section
layout, fixups, output formats, diagnostics, and tooling APIs. It should not
retain ZAX-era abstractions unless they still serve one of those jobs directly.

When a change makes the codebase larger, more indirect, or harder to explain,
the burden is on the change to justify why that complexity belongs in AZM.

## Functions

Functions should do one job at one level of abstraction.

A good function normally:

- has a name that says what it does without needing a comment
- has a clear input and output contract
- keeps parsing, validation, transformation, mutation, and output separate when
  those are distinct responsibilities
- returns early when that makes the main path easier to read
- avoids hidden writes through broad context objects unless mutation is the
  function's explicit job
- is small enough that a reviewer can hold the whole behavior in memory

Long functions are acceptable when they are simple tables, direct dispatchers,
or clear phase coordinators. They are not acceptable when they mix unrelated
decisions, duplicate logic from another subsystem, or require comments to
explain their internal map.

## Names

Names are part of the design.

Use names that reflect the current AZM architecture, not the historical path by
which the code arrived here. If native AZM code is no longer a ZAX function, do
not make new native assembler code depend on function-shaped names unless there
is a deliberate temporary bridge.

Prefer:

- domain names over generic names
- `parse`, `resolve`, `lower`, `emit`, `place`, and `write` for phase-specific
  work
- names that distinguish native AZM, ASM80 compatibility, and ZAX retirement
  code
- explicit helper names over comments that explain vague helpers

Avoid:

- `handle`, `process`, `doThing`, `data`, `item`, or `context` when a narrower
  name is available
- names that hide whether a value is AST, lowered IR, emitted bytes, source
  text, or formatted output
- compatibility names for core AZM behavior after the compatibility layer has
  been crossed

## Comments and Documentation

Good names and good structure should remove most comments.

Use comments for:

- invariants that are easy to break
- non-obvious compiler or Z80 behavior
- temporary bridges with a deletion direction
- decisions that look strange unless the historical reason is stated

Do not use comments to restate the code. If a comment says what the next three
lines do, rename or extract the code instead.

Documentation should explain subsystem boundaries, user-visible behavior, and
review rules. It should not become a substitute for readable source.

## Source File Size

The normal upper limit for a source file is 500 lines.

That limit is a review trigger, not a blind mechanical rule. A file may exceed
500 lines when it has a clear reason, such as:

- a dense AST or type definition file
- a generated or table-like file
- a stable encoder table where splitting would make lookup harder
- a short-term migration bridge with an explicit cleanup path

When a normal library or compiler phase file crosses the limit, prefer
splitting by responsibility:

- parser coordinator versus mode-specific parsers
- phase orchestration versus phase helpers
- shared domain logic versus compatibility adapters
- pure transformation helpers versus mutation-heavy emitters
- public API surface versus internal implementation

Run:

```sh
npm run check:source-file-sizes
```

Use the enforcing variant when preparing a cleanup branch that intends to make
file size a hard gate:

```sh
npm run check:source-file-sizes:enforce
```

## Modules and Boundaries

Organize code around compiler responsibilities, not around incidental reuse.

The primary boundaries are:

- frontend parsing
- semantic environment construction
- lowering and emission
- section layout and fixups
- output format writing
- register-care analysis
- CLI and tooling API wiring
- ASM80 compatibility
- ZAX retirement quarantine

Shared helpers should sit at the lowest honest layer. If both native emission
and register-care need op expansion, the shared service should describe op
expansion itself. It should not live inside one consumer and force the other
consumer to imitate it.

Compatibility adapters should be thin. They may translate an old surface into a
neutral AZM representation, but they should not make the neutral representation
look like the old surface forever.

## Duplication

Some duplication is cheaper than a bad abstraction, but semantic duplication is
dangerous.

Remove repeated code when:

- two implementations must stay behaviorally identical
- tests need to assert the same rule in multiple places
- a bug fix would have to be copied
- naming drift is hiding the fact that two paths do the same job

Keep code separate when:

- the behaviors are only superficially similar
- merging them would introduce mode flags or callback-heavy control flow
- the shared abstraction would know too much about its callers

Prefer small pure helpers for shared compiler facts: expression classification,
operand matching, symbol lookup, span formatting, fixup shape, op substitution,
and byte-range math.

## Dead Code

Delete dead code aggressively once the associated behavior is no longer part of
AZM.

Do not keep code because it may be useful later. Historical behavior belongs in
Git history or explicit retirement tests, not in live compiler paths.

Before deleting code, check whether it is:

- part of native AZM
- part of ASM80 compatibility
- part of register-care, AZMDoc, visible `op` expansion, directive aliases, or
  layout constants
- part of the ZAX retirement quarantine
- only reachable from obsolete tests or examples

If the only remaining consumer is a retirement test, prefer moving the code
toward quarantine and documenting the deletion condition.

## Algorithms and Data Structures

Use algorithms that match assembler-scale work.

Prefer deterministic, explicit data flow:

- maps for symbol lookup
- ordered arrays when source order matters
- stable sorted output only where output contracts require it
- pure expression evaluators where possible
- clear pass boundaries instead of hidden global state

Avoid cleverness that makes diagnostics, fixups, or source spans harder to
reason about. A compiler bug with a clear phase boundary is usually easier to
fix than a shorter implementation that spreads state across helpers.

When performance matters, measure the path before optimizing it. AZM should be
lean, but most cleanup should start with simpler ownership, less duplication,
and fewer obsolete paths.

## Tooling Gates

Use the existing tools as routine maintenance checks:

```sh
npm run typecheck
npm run lint
npm run fallow
npm run fallow:dead-code
npm run fallow:dupes
npm run fallow:health
npm run check:source-file-sizes
```

Use `npm run fallow:audit` when comparing a cleanup branch against `main`.

Fallow findings are prompts for engineering review, not automatic delete
orders. Confirm generated files, dynamic entry points, CLI exports, package
exports, and test-only fixtures before removing anything.

## Refactoring Rules

Refactors should reduce live complexity without changing behavior unless the
behavior change is the point of the branch.

For ordinary cleanup:

1. Preserve existing tests first.
2. Move code behind clearer names and narrower modules.
3. Add focused tests around any boundary that was previously implicit.
4. Delete the obsolete path only after the new path is covered.
5. Run the relevant test lane and quality tools.

For ZAX retirement cleanup:

1. Identify whether the code is retained AZM, ASM80 compatibility, or retirement
   quarantine.
2. Move retained behavior behind AZM-facing names.
3. Move compatibility behavior behind compatibility-facing adapters.
4. Remove or quarantine ZAX-only behavior.
5. Update `docs/code-quality-findings.md` or the relevant audit when a major
   bridge is removed.

## Review Checklist

Before merging substantial compiler changes, ask:

- Does each changed function have one clear responsibility?
- Did any file cross 500 lines without a documented reason?
- Did this add another mode branch to an already overloaded file?
- Is the naming AZM-native, or does it preserve obsolete ZAX concepts?
- Is duplicated logic now shared where drift would be dangerous?
- Did dead code become unreachable, and was it removed?
- Are comments explaining invariants rather than narrating obvious code?
- Is the behavior covered by the right test lane?
- Did Fallow, lint, typecheck, and source-size checks produce actionable output?

## Long-Term Skill Direction

This document is intended to become the basis for an AZM code-quality skill once
the standards are tested against real cleanup work.

The eventual skill should be stricter than this document in workflow:

- inspect file sizes before editing
- run Fallow before broad cleanup
- classify code as retained AZM, ASM80 compatibility, or ZAX retirement
- require an explicit deletion reason for dead code
- require shared tests where semantic duplication is removed
- refuse large refactors that do not improve boundaries or reduce live
  complexity

Until then, this standard is the active reference for code-quality review.
