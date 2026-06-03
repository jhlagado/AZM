# Docs Index

This directory holds the small active working set for AZM.

---

## Active working set

### `docs/spec/`

Metadata and editor-adjacent documents. Source code and tests are authoritative
for assembler behavior.

- [`docs/spec/azmdoc.md`](spec/azmdoc.md) — AZMDoc metadata-comment standard for routine contracts and tooling
- [`docs/spec/azm.tmLanguage.json`](spec/azm.tmLanguage.json) — draft TextMate grammar for AZM syntax highlighting
- [`docs/spec/azm-textmate-highlighting.md`](spec/azm-textmate-highlighting.md) — TextMate grammar usage notes

### `docs/reference/`

Current user- and contributor-facing references.

- [`docs/reference/cli.md`](reference/cli.md) — command-line interface reference
- [`docs/reference/testing-verification-guide.md`](reference/testing-verification-guide.md) — testing and verification flow
- [`docs/reference/source-overview.md`](reference/source-overview.md) — compiler source structure
- [`docs/reference/code-quality-standard.md`](reference/code-quality-standard.md) — code organization, cleanup, and tooling standard
- [`docs/reference/tooling-api.md`](reference/tooling-api.md) — Node tooling and compile API

These do not override the live implementation and tests.

### `docs/design/`

Only active design work stays here.

- `docs/design/exact-size-layout-and-indexing.md`
- `docs/design/asm80-compatibility-baseline.md`
- `docs/design/azm-directive-aliases.md`
- `docs/design/azm-expression-and-visibility.md`
- `docs/design/azm-language-direction.md`
- `docs/design/azm-ops-subset.md`
- `docs/design/azm-register-contracts-safety.md`

Delete landed, superseded, or low-priority design notes rather than keeping a
parallel historical document set.

### `docs/work/`

Small operational working set only.

- [`docs/work/deferred-work.md`](work/deferred-work.md) — explicit backburner items

Delete tranche plans, audits, and superseded planning notes when they stop being
active.

---

## Rules

- Do not add new top-level files under `docs/` except `docs/README.md`.
- Every new document belongs under exactly one of: `spec`, `reference`, `design`, or `work`.
- Keep the active working set small.
- Source code and tests are authoritative for assembler behavior.
- `reference/` is for current supporting material.
- `design/` is for active design only.
- `work/` is for current operational briefs only.
