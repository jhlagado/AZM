# AZM Next

Status: greenfield replacement track

`next/` is the future-root scaffold for a clean AZM implementation. It mirrors
the repository shape that can later be promoted to the project root when the
replacement is ready.

The current AZM implementation is the behavioral oracle: its tests, fixtures,
corpus comparisons, and documented outputs define compatibility targets. Its
internal module structure is not the architecture for this implementation.

Implementation work must follow the evidence hierarchy and workflow in
`docs/source-of-truth.md`.

## Rules

- Production code under `next/src/` must not import production code from root
  `src/`.
- Tests under `next/test/` may compare against root fixtures and the current AZM
  CLI when building differential coverage.
- New implementation code should use assembler terms: source lines, labels,
  directives, symbols, sections, fixups, emitted bytes, listings, and metadata.
- High-level ZAX compiler concepts are out of scope.
- Output writers serialize completed assembly results; they must not change
  compilation semantics.

## Layout

```text
next/
  src/       replacement implementation
  test/      next-specific unit, integration, and differential tests
  fixtures/  fixtures owned by the replacement track
  scripts/   helper scripts for parity and differential checks
  docs/      architecture notes and parity tracking
```

See:

- `docs/architecture.md`
- `docs/source-of-truth.md`
- `docs/stage-4-evidence.md`
- `docs/parity-matrix.md`
- `docs/promotion-criteria.md`

## Local Checks

From the repository root:

```sh
npm run next:typecheck
npm run next:test
npm run next:check
```

The initial scaffold is intentionally thin. The first real milestone is a
minimal flat assembler path: source text to parsed lines, labels, `ORG`, `EQU`,
`DB`, `DW`, `DS`, a small instruction subset, and binary/HEX output.
