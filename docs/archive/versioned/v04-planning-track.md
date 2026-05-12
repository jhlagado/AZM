# ZAX v0.4 Planning Track

This document is the active planning view after v0.3 closeout.

Normative shipped behavior remains in `docs/spec/zax-spec.md`. This file is the
future-work planning layer only.

## 1. Starting point after v0.3

- v0.3 implementation is treated as complete.
- v0.3 workflow additions now part of the established project surface:
  - `docs/reference/codegen-corpus-workflow.md`
  - `docs/virtual-reg16-transfer-patterns.md`

## 2. Current v0.4 stance

v0.4 is a code-quality release line.

Its purpose is to improve the quality, maintainability, and inspectability of
the existing compiler rather than to add new language surface.

The main concerns driving v0.4 are:

- the codebase has grown through rapid iterative changes
- the spec has evolved while implementation details accumulated
- some code paths are likely stale, duplicated, overly coupled, or poorly
  understood
- large files, especially `src/lowering/emit.ts`, need structural cleanup

v0.4 therefore focuses on:

- refactoring
- modularization
- dead-code and duplication audits
- documentation consolidation
- coverage improvement in weakly tested areas

v0.4 does **not** start as a feature-expansion cycle. New syntax or new surface
capability should stay out of scope until the compiler internals are in better
shape and the existing implementation is better understood.

## 3. Active workstreams

### Track A. Remaining emitter decomposition

The original audit and broad refactor pass have been completed, but one major
structural failure remains:

- `src/lowering/emit.ts` is still above the hard cap
- it remains the only unacceptable source-file-size violation in `src/`
- v0.4 is not complete until it is reduced below 1000 lines

The current active work is therefore a strict decomposition sequence for the
remaining `emit.ts` clusters:

- `#528`
- `#529`
- `#530`
- `#531`
- `#532`
- `#533`

### Track B. Refactoring and modularization

The guiding rule for the active refactor sequence is still the same:

- break oversized files into clearer modules
- isolate reusable lowering helpers
- reduce ad hoc branching where explicit helper layers would be clearer
- keep behavior-preserving refactors separate from functional changes wherever
  possible

Current hard acceptance criteria:

- `src/lowering/emit.ts` must end below 1000 lines
- preferred end state is below 750 lines
- no newly extracted file may exceed 1000 lines

### Track C. Documentation consolidation

The first consolidation pass is complete. The remaining rule is simple:

- keep the docs set small
- delete stale planning/support notes rather than preserving them
- keep one active planning layer for the current release line

### Track D. Coverage and regression hardening

Coverage work remains active, but it is not the current blocker:

- identify low-coverage areas
- add focused regression tests around poorly covered lowering paths
- improve confidence in emitted output for existing supported behavior
- treat test additions as a way to lock current behavior before deeper refactors

Primary issue:

- `#468` — audit coverage gaps and add targeted regression tests for weak areas

## 4. Explicitly out of scope at the start of v0.4

These are not the focus of the initial v0.4 cycle:

- new syntax
- new language-level features
- speculative capability expansion
- broad semantic redesign

After the code-quality work is complete, syntax sharpening can be reconsidered
from a stronger codebase position.

## 5. Planning rules for v0.4

- Start from a fresh justification for each proposed feature.
- Prefer small, explicit slices with one issue per PR.
- Treat old plans as historical context only unless they are deliberately
  reissued as current v0.4 work.
- Do not silently convert completed v0.3 work into continuing “phase two” work
  without a new scope decision.
- Prefer semantics-preserving cleanup first; functional changes should be
  justified separately.

## 6. How to activate a v0.4 item

Before a feature enters the active queue:

1. define the user-facing value
2. define the exact supported scope
3. define what remains explicitly unsupported
4. define the acceptance checks
5. add it to `docs/archive/versioned/v04-priority-queue.md`

Until then, it is only a candidate idea, not active implementation work.
