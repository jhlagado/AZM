# AZM Next Promotion Criteria

Status: gates satisfied for differential replacement readiness; mechanical cutover pending user approval

AZM Next can replace the current implementation only after observable behavior
is covered and known differences are classified.

## Required Gates

| Gate | Status |
| ---- | ------ |
| `next/src/` production code imports no root `src/` production modules | Satisfied |
| `npm run next:check` passes | Satisfied |
| AZM Next alpha/guardrail orchestration (`next:guardrails*`) | Satisfied (Stage 16 Slice B) |
| Core fixture output matches current AZM for retained behavior | Satisfied for **58** root fixtures; **27** explicitly unsupported with reasons |
| ASM80 corpus comparisons match where local corpora are available | Partial (differential + dev scripts; not blocking promotion gate) |
| Retained AZM extension tests pass | Satisfied via `next:check` integration suites |
| CLI behavior compatible for documented flags and output paths | Partial (Stage 13 façade; see parity matrix) |
| Public package APIs compatible or intentionally documented | Satisfied (Stage 12/16 package smoke) |
| Output artifacts compatible (BIN, HEX, listing, D8, lowered Z80) | BIN/HEX compatible; listing/D8/lowered `.z80` partial per parity matrix |
| Historical high-level ZAX behavior not reintroduced | Satisfied (replacement scope unchanged) |

## Promotion Shape

`next/` is laid out as a future root. Promotion should be mechanical:

```text
next/src      -> src
next/test     -> test
next/scripts  -> scripts
next/docs     -> docs or docs/next history
```

Before promotion, archive or remove obsolete current implementation files rather
than mixing old and new module structures.

## Pre-promotion checklist

1. User explicitly approves cutover (this document does not authorize promotion by itself).
2. Run `npm run next:guardrails` on the release branch.
3. Run root `npm run test:package` after `npm run build`.
4. Archive or remove superseded `src/` modules per promotion plan in `next/docs/stage-16-evidence.md`.
5. Update package exports if any intentional API deltas were documented during Stages 11–12.

## Non-Goals

- Reimplementing ZAX functions, modules, imports, generated frames, typed
  assignment, or structured high-level control.
- Preserving internal module names from the current implementation.
- Matching current bugs unless a corpus requires compatibility and the behavior
  is documented.
