# Codegen Corpus (Curated Inspection Set)

This folder is the committed inspection mirror for the curated codegen corpus.

The supported workflow is defined in:

- `docs/reference/codegen-corpus-workflow.md`

The manifest for the curated set is:

- `test/fixtures/corpus/manifest.json`

The manifest uses explicit mixed-source entries. It does not assume one source
folder for every curated case.

## Ownership

Canonical ownership is split:

- curated source inputs: the explicit `source` paths listed in the manifest
- automated golden backend text: `test/fixtures/corpus/golden/*.z80`
- automated expected opcodes: `test/fixtures/corpus/opcode_expected/*.hex`

This folder is the side-by-side review mirror:

- `test/codegen-corpus/*.zax`
- `test/codegen-corpus/*.z80`
- `test/codegen-corpus/*.bin`
- `test/codegen-corpus/*.hex`

Legacy `.asm` trace output has been removed; it is not
canonical.

## Supported regeneration

Use exactly:

```bash
npm run regen:codegen-corpus
```

Do not regenerate curated files one by one by hand.

## Current curated set

Read `test/fixtures/corpus/manifest.json` for the supported list.

For future expansion, prefer `test/language-tour/30+` for addressing/codegen
cases and use this folder for synthetic non-teaching cases.
