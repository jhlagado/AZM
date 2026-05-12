# Trace Backend Deprecation and Test Rationalization Plan

## Status: COMPLETE — Full removal completed

The `.asm` trace backend has been fully removed. `.z80` is now the only textual lowered-output artifact.

## Phase 5 — Full removal completed

All `.asm` artifacts, supporting code, tests, and fixture files have been deleted. The migration tracked by this document is complete.

---

## Historical context

ZAX now has a real assembler-valid lowered backend:

- direct machine-code emission
- placed lowered program IR
- ASM80-compatible lowered source (`.z80`)
- differential validation against ASM80

The legacy `.asm` artifact was a debug trace/listing-style output. The main remaining reason it could not be removed was that a large part of the regression suite still depended on its exact text shape.

This document defined how to shrink that dependency without losing coverage.

## Current state

### What `.asm` is

The legacy writer in `/Users/johnhardy/.codex/worktrees/toolchain/ZAX/src/formats/writeAsm.ts` renders:

- sorted lowering trace entries from `map.asmTrace`
- inline offset/byte comments
- a synthetic `; symbols:` footer

It is deterministic and useful for debugging, but it is not backend-authoritative and it is not assembler-valid.

### What `.z80` is

The ASM80 writer in `/Users/johnhardy/.codex/worktrees/toolchain/ZAX/src/formats/writeAsm80.ts` consumes the placed lowered program and emits:

- `ORG`
- labels
- `EQU`
- `DB` / `DW` / `DS`
- lowered instructions
- preserved user comments and generated `; ZAX:` comments

This is now the canonical textual backend artifact.

### Why `.asm` still exists

The current suite still uses `.asm` heavily for regression checking.

Observed at the time of this plan:

- `emitAsm: true` appears dozens of times in `test/*.test.ts`
- many integration tests assert on `.asm` string content
- curated corpus mirrors and goldens are still stored as `.asm`
- CLI still emits `.asm` by default unless `--noasm` is used

The blocker is not backend correctness. The blocker is test coupling.

## Decision

1. `.z80` is the canonical textual backend artifact.
2. `.asm` is demoted to a debug/listing-style artifact.
3. No new backend or codegen correctness test should be added against `.asm` unless the feature under test is specifically trace/listing behavior.
4. Existing `.asm` tests should be migrated in batches to one of:
   - placed lowered-program IR assertions
   - `.z80` textual assertions
   - direct byte / HEX assertions
   - D8M/source-mapping assertions
5. `.asm` should remain in the product only until the old test surface is reduced to a small intentional smoke suite.

## Target testing model

### 1. Front-end tests

Keep direct tests for:

- parser behavior
- token normalization
- AST shape
- grammar edge cases

These should not depend on backend artifacts.

### 2. Semantic and diagnostic tests

Keep direct tests for:

- type/storage legality
- alias rules
- call legality
- assignment/path legality
- diagnostic IDs and messages

These should not depend on `.asm` or `.z80` unless the text artifact itself is the contract.

### 3. Lowered-program tests

This is the missing layer and the main replacement for many current `.asm` tests.

Add stable helpers that assert against the placed lowered program rather than a trace string. Typical checks should include:

- instruction heads and operand shapes
- label presence/order
- `DB` / `DW` / `DS` items
- `ORG` block structure
- startup-init insertion
- synthetic symbol naming invariants

This should become the main oracle for lowering-shape regressions.

### 4. Backend differential tests

Use differential checks as the canonical backend-correctness test:

- direct ZAX bytes / HEX
- versus `.z80` assembled by ASM80

Expand this where useful, but keep it focused on representative coverage rather than snapshot bulk.

### 5. CLI and product tests

Keep explicit tests for:

- artifact presence/absence
- flag behavior
- output naming
- failure/exit-code contracts

CLI tests should not treat `.asm` as special beyond its declared artifact role.

## Migration plan

## Tracking issues

- `#992` Add placed lowered-program test helpers and first migrations
- `#993` Migrate lowering regression tests off legacy trace `.asm`
- `#994` Rationalize curated codegen corpus around `.hex` and `.z80`
- `#995` Demote legacy trace `.asm` in CLI and reference docs
- `#996` Reduce legacy trace `.asm` coverage to a narrow smoke suite

### Phase 1 — Add lowered-program test helpers

Add stable test helpers for the placed lowered program and use them in one or two representative lowering tests.

Done when:

- there is a helper layer for placed lowered-program assertions
- at least a small set of current `.asm` string-match tests have been ported

### Phase 2 — Migrate lowering regression tests off `.asm`

Port tests that only need instruction/lowering shape, for example:

- shuttle sequences
- IX slot access patterns
- placeholder removal / canonicalized heads
- startup-init insertion checks

Target destination:

- placed lowered-program assertions first
- `.z80` assertions only where textual backend output is the real contract

### Phase 3 — Rationalize the curated corpus

Split the current corpus role into two explicit layers:

- machine-level goldens: `.hex`
- textual backend goldens: `.z80` where textual backend inspection is still useful

The old `.asm` corpus should stop being treated as canonical codegen output.

### Phase 4 — Demote `.asm` in product surface

Once most regression coverage no longer depends on `.asm`:

- review whether CLI should continue to emit `.asm` by default
- decide whether `.asm` remains opt-in only, or stays as a lightweight debug/listing artifact
- update reference docs to reflect the demotion explicitly

### Phase 5 — Reduce `.asm` to a narrow smoke suite

Keep only a small intentional `.asm` suite, for example:

- one writer-format test
- one CLI artifact-presence test
- one trace/listing formatting regression if still useful

At that point, removal becomes a product decision rather than a testing blocker.

## What should move where

### Migrate to placed lowered-program assertions

Good candidates:

- instruction sequence checks currently doing `.asm` string matching
- startup-init placement checks
- label/order checks
- shaped data/lowering checks

### Migrate to `.z80` assertions

Good candidates:

- textual backend snapshots where assembler-valid lowered source is what matters
- comment-preservation checks
- emitted `ORG` / `DB` / `DW` / `DS` rendering checks

### Migrate to HEX/bytes

Good candidates:

- pure opcode equivalence
- code size / address-sensitive checks
- placement/fixup correctness

### Leave on `.asm` for now

Only where the trace-specific formatting is the thing being tested:

- inline byte comments
- `; symbols:` footer
- trace sorting/pretty-printing behavior

## Non-goals

This plan does not:

- remove `.asm` immediately
- add another assembler dialect
- redesign the `.lst` format
- collapse all tests into one mechanism

## Exit criteria

The legacy `.asm` backend is no longer a significant maintenance burden when all of the following are true:

1. lowering regressions are tested primarily against the placed lowered program
2. textual backend regressions are tested primarily against `.z80`
3. corpus goldens no longer depend on `.asm` as the canonical backend output
4. only a small explicit smoke suite still exercises `.asm`

At that point, the project can choose between:

- keeping `.asm` as a small debug/listing artifact
- or retiring it entirely
