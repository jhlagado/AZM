# Codegen Corpus Workflow

This document defines the supported workflow for the curated codegen corpus in
v0.3.

## Scope

The supported workflow applies only to the curated corpus declared in:

- `test/fixtures/corpus/manifest.json`

That manifest is the single source of truth for:

- which positive cases are part of the curated corpus
- which negative source-only cases are part of the supported inspection set
- the explicit source path for each case
- which source family each case belongs to
- where canonical generated fixtures live
- where the inspectable mirror output lives

Additional files in `test/codegen-corpus/` may exist for ad hoc inspection,
but they are not part of the supported curated workflow unless they are added to
the manifest.

The manifest is intentionally mixed-source. It does not assume one source folder.
Each entry declares:

- `name`
- `source`
- `kind`

This allows the curated set to include:

- `test/language-tour/30+` addressing/codegen cases
- `test/codegen-corpus/` synthetic non-teaching cases
- future explicitly curated sources if needed

## Ownership

Canonical ownership is split:

- curated source inputs: the explicit `source` paths listed in the manifest
- canonical expected textual backend output: `test/fixtures/corpus/golden/*.z80`
- canonical expected opcodes: `test/fixtures/corpus/opcode_expected/*.hex`

Inspectable mirror output lives in:

- `test/codegen-corpus/`

The mirror is committed so the curated source files and generated `.z80` /
`.bin` / `.hex` artifacts can be reviewed side by side.
The automated golden references remain under `test/fixtures/corpus/`.

## Supported regeneration command

Use exactly:

```bash
npm run regen:codegen-corpus
```

That command:

1. builds the current compiler
2. reads `test/fixtures/corpus/manifest.json`
3. resolves each curated source path explicitly from the manifest
4. regenerates curated positive-case artifacts into a temporary stable folder
5. updates:
   - `test/codegen-corpus/*.zax` when the manifest source lives outside the
     mirror
   - `test/codegen-corpus/*.z80`
   - `test/codegen-corpus/*.bin`
   - `test/codegen-corpus/*.hex`
   - `test/fixtures/corpus/golden/*.z80`
   - `test/fixtures/corpus/opcode_expected/*.hex`
6. leaves negative source-only cases untouched; they remain source-only checks

## Determinism expectation

The workflow is expected to be deterministic for a fixed compiler revision:

- rerunning `npm run regen:codegen-corpus` without code changes should produce no
  diff
- any diff in curated artifacts should therefore be treated as a deliberate
  compiler or fixture change and reviewed accordingly

## Contributor rule

- Do not regenerate individual curated files by hand.
- Do not add a new supported curated corpus case without first updating
  `test/fixtures/corpus/manifest.json`.
- Do not expand the curated set outside issue `#303`; `#453` defines the
  workflow only.
- For addressing/codegen expansion under `#303`, prefer `examples/language-tour`
  `30+` as the primary teaching-backed input set, and use
  `test/codegen-corpus/` for non-teaching synthetic cases.
