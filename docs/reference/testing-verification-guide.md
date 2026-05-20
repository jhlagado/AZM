# AZM/ZAX Testing and Verification Guide (Canonical)

This is the single contributor reference for local verification flow, fixture refresh commands, and CI expectations.

Native AZM behavior is tracked by the AZM design and baseline docs under
`docs/design` and `docs/spec`. Legacy ZAX docs describe code being removed; they
are not a compatibility contract for AZM.

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

## AZM alpha guardrails

Run the repository-local alpha gate before proposing alpha-foundation changes:

```sh
npm run test:azm:alpha
```

This command builds AZM and runs the non-private alpha checks for register-care,
native flat `.azm` parsing, directive aliases, ASM80 includes, core ASM80
directives, equate aliases, strings, alignment, visible op expansion, and
layout constants. It uses only files in this repository, so contributors can
run it without local MON3, TEC-1G, Tetro, or Pacmo checkouts. It does not run
inherited high-level `.zax` lowering tests such as typed assignment, generated
typed storage, aggregate locals, typed address-of behavior, generated function
frames, ZAX imports, or named sections.

Run the temporary `.zax` removal lane when touching inherited high-level ZAX
lowering:

```sh
npm run test:zax:retirement
```

The current `.zax` lane is a removal batch. It covers old high-level ZAX
behavior while that code is being deleted or rewritten. Passing this lane does
not mean the behavior should remain.

Optional corpus gates remain separate because they require local source trees:

- `npm run test:azm:corpus` — compares local Tetro/Pacmo HEX output against ASM80 (skips missing repos/tools)
- `npm run test:asm80:baseline`
- `npm run test:asm80:tetro`
- MON3 and TEC-1G checks when their source paths are configured

AZM alpha test buckets (what to run for a given change class) are listed in
`docs/audits/azm-alpha-test-buckets.md`.

Run the optional corpus guardrail before parser, directive, include, and
emission PRs:

```sh
npm run build
npm run test:azm:corpus
```

This command is local-workspace only and read-only for external source trees. It
looks for `/Users/johnhardy/projects/tetro`, builds the configured Tetro and
Pacmo entries with both ASM80 and the built AZM CLI, writes outputs under a
temporary directory, and compares HEX payloads after ignoring only final newline
differences. Missing `asm80`, missing Tetro, and the currently unconfigured MON3
entry are reported as `SKIP` rather than guessed.

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

### Register-Care Audit

Run register-care analysis without changing ASM80-compatible output:

```sh
npm run azm -- --rc audit --reg-report path/to/source.z80
```

This writes `path/to/source.regcare.txt`. The default mode remains `off`, so
existing ASM80 compatibility checks are unchanged unless a register-care flag is
supplied.

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
