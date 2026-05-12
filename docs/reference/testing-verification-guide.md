# ZAX Testing and Verification Guide (Canonical)

This is the single contributor reference for local verification flow, fixture refresh commands, and CI expectations.

Normative language behavior remains defined only by `docs/spec/zax-spec.md`.

## Local verification flow

Run from repo root:

```sh
npm ci
npm run typecheck
```

For a focused change, run targeted tests first:

```sh
npm test -- --run test/<targeted-test-file>.test.ts
```

Run smoke compile coverage before opening a PR:

```sh
npm test -- --run test/smoke_language_tour_compile.test.ts
```

Run file-size guard for refactor slices:

```sh
npm run check:source-file-sizes
```

Run full suite when your slice touches broad behavior:

```sh
npm test
```

Run the opt-in external ASM80 replacement baseline when touching classic ASM80
parsing, lowering, CLI binary output, or ASM80 compatibility docs:

```sh
npm run test:asm80:baseline
```

This builds the local ZAX CLI, runs the MON3 byte-for-byte acceptance test
against a fresh ASM80-built reference, and runs the TEC-1G non-macro corpus
comparison. It depends on sibling local projects/tools, so normal CI does not
run it by default.

The default local paths match the maintainer workspace. Override them when your
checkout layout differs:

```sh
MON3_SOURCE=/path/to/MON3/src/mon3.z80 \
TEC1G_SOFTWARE_ROOT=/path/to/TEC-1G/Software \
ASM80=/path/to/asm80 \
npm run test:asm80:baseline
```

Run the opt-in Tetro application check when touching loadable binary range
semantics, `DS` behavior, or classic `EQU` resolution:

```sh
npm run test:asm80:tetro
```

This builds a fresh ASM80 reference from the local Tetro source tree and trims
the ASM80 64K output to the populated listing range before comparing it with
ZAX output. Override the default source path and ASM80 executable when needed:

```sh
TETRO_SOURCE=/path/to/tetro.asm \
ASM80=/path/to/asm80 \
npm run test:asm80:tetro
```

For docs-only changes, check changed docs paths with Prettier:

```sh
npx prettier -c <changed-doc-paths...>
```

## Fixture refresh commands

Refresh language-tour generated artifacts:

```sh
npm run regen:language-tour
```

Refresh codegen corpus generated artifacts:

```sh
npm run regen:codegen-corpus
```

After running either refresh command:

1. Re-run `npm run typecheck`.
2. Run targeted tests touching the refreshed fixtures.
3. Run `npm test -- --run test/smoke_language_tour_compile.test.ts`.

## CI expectations

- PRs to `main` run through `.github/workflows/ci.yml`.
- Docs-only changes are detected by `scripts/ci/change-classifier.js`.
- Docs-only path set:
  - `docs/**`
  - `*.md`
  - `.github/ISSUE_TEMPLATE/**`
- Docs-only result:
  - run `docs (fast)`
  - skip full `test (ubuntu/macos/windows)` matrix
- Any non-doc path changed:
  - run full platform matrix

Do not merge while required CI jobs are pending or failing.

## PR verification evidence

In every PR body, include:

1. Scope summary (what changed and what did not).
2. Verification commands you ran.
3. Current CI state (pending/green/failing) with the PR link.
