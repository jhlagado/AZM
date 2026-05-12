# Docs Index

This directory holds the small active working set for ZAX plus archived history.

Learning content (course chapters and examples) lives under [`learning/`](../learning/README.md).

---

## Active working set

### `docs/spec/`

Normative language documents.

- [`docs/spec/zax-spec.md`](spec/zax-spec.md) — the language specification; wins any conflict with other docs
- [`docs/spec/zax-grammar.ebnf.md`](spec/zax-grammar.ebnf.md) — grammar companion to the spec

### `docs/reference/`

Current user- and contributor-facing references.

- [`docs/reference/ZAX-quick-guide.md`](reference/ZAX-quick-guide.md) — practical language guide
- [`docs/reference/testing-verification-guide.md`](reference/testing-verification-guide.md) — testing and verification flow
- [`docs/reference/source-overview.md`](reference/source-overview.md) — compiler source structure
- [`docs/reference/addressing-steps-overview.md`](reference/addressing-steps-overview.md) — map of `lowering/steps.ts` template and EA-builder families
- [`docs/reference/zax-dev-playbook.md`](reference/zax-dev-playbook.md) — contributor workflow and review hygiene
- [`docs/reference/codegen-corpus-workflow.md`](reference/codegen-corpus-workflow.md) — curated corpus workflow

These do not override the spec.

### `docs/design/`

Only active design work stays here.

- `docs/design/exact-size-layout-and-indexing.md`
- `docs/design/asm80-compatibility-baseline.md`
- `docs/design/asm80-first-language-track.md`
- `docs/design/asm80-mon3-compatibility-audit.md`
- `docs/design/grammar-parser-convergence-plan.md`
- `docs/design/vscode-language-services-direction.md`
- `docs/design/z80-programming-with-zax.md`
- `docs/design/zax-algorithms-course.md`

Landed, superseded, or low-priority design notes belong under `docs/archive/design/`.

### `docs/work/`

Small operational working set only.

- [`docs/work/current-stream.md`](work/current-stream.md) — active implementation direction
- [`docs/work/deferred-work.md`](work/deferred-work.md) — explicit backburner items
- [`docs/work/course-writing-standard.md`](work/course-writing-standard.md) — editorial gate for course prose
- [`docs/work/course-program-plan.md`](work/course-program-plan.md) — consolidated active course-planning brief

Tranche plans, audits, and superseded planning notes belong under `docs/archive/work/`.

### `docs/archive/`

Cold storage for historical, superseded, versioned, or deep-reference material.
Not current guidance. See [`docs/archive/README.md`](archive/README.md) for the thematic archive index.

---

## Rules

- Do not add new top-level files under `docs/` except `docs/README.md`.
- Every new document belongs under exactly one of: `spec`, `reference`, `design`, `work`, `archive`.
- Keep the active working set small.
- `spec/` is authoritative.
- `reference/` is for current supporting material.
- `design/` is for active design only.
- `work/` is for current operational briefs only.
- `archive/` is retained for context only.
