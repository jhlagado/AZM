# AZM Testing and Verification Guide

This is the single contributor reference for local verification flow, fixture refresh commands, and CI expectations.

AZM assembler behavior is tracked by the AZM design and baseline docs under
`docs/design` and `docs/spec`. Retained behavior is covered as ASM80-baseline
or `.asm`/`.z80` AZM coverage; retired high-level constructs do not have a
separate test lane.

## Local verification flow

Run from repo root:

```sh
npm ci
npm run typecheck
```

For a focused change, run targeted tests first:

```sh
npm run test:all -- --run test/<targeted-test-file>.test.ts
```

Run file-size guard for refactor slices:

```sh
npm run check:source-file-sizes
```

Run full suite when your slice touches broad behavior:

```sh
npm run test:all
```

## AZM alpha guardrails

Run the repository-local alpha gate before proposing alpha-foundation changes:

```sh
npm run test:azm:alpha
```

This command builds AZM and runs the alpha checks for register contracts,
flat `.asm` parsing, directive aliases, ASM80 includes, core ASM80
directives, equate aliases, strings, alignment, inline op expansion, and
layout constants. It uses only files in this repository, so contributors can
run it without local MON3, TEC-1G, Tetro, or Pacmo checkouts.

Optional corpus gates remain separate because they require local source trees:

- `npm run test:azm:corpus` — compares local Tetro/Pacmo HEX output against ASM80 (skips missing repos/tools)
- `npm run test:asm80:baseline`
- `npm run test:asm80:tetro`
- MON3 and TEC-1G checks when their source paths are configured

`npm run next:guardrails:core` runs `check:asm80-coverage` before differential
parity. Run the asm80 lowering coverage check when touching `write-asm80`,
`emitAsm80`, or `--asm80`:

```sh
npm run build
npm run check:asm80-coverage
```

This compiles every `test/fixtures/**/*.asm` entry with `emitAsm80: true` and
fails on the first `AZMN_ASM80` diagnostic per file. Optional real-program
sources are included when present (override with env vars):

```sh
MON3_SOURCE=/path/to/MON3/src/mon3.z80 \
TETRO_SOURCE=/path/to/tetro/src/tetro/tetro.z80 \
PACMO_SOURCE=/path/to/tetro/src/pacmo/pacmo.z80 \
npm run check:asm80-coverage
```

CI does not require local MON3/Tetro trees; missing optional sources are
reported as `SKIP` in `check:asm80-coverage` and as Vitest todos in
`emit_asm80_real_program_acceptance.test.ts`.

### GitHub Actions: optional real-program sources

The Linux job runs `npm run test:ci:asm80-parity`, which sets
`AZM_RUN_MON3_ASM80_ACCEPTANCE=1`, `AZM_RUN_TETRO_ASM80_ACCEPTANCE=1`, and
`AZM_RUN_PACMO_ASM80_ACCEPTANCE=1`. No secrets are required. When the checkout
does not contain MON3/Tetro/Pacmo trees, tests record `it.todo` skips instead of
failing.

To exercise real-program lowering in CI when sibling repos are available, set
repository or environment variables on the workflow (paths must exist on the
runner):

```yaml
env:
  MON3_SOURCE: ${{ github.workspace }}/../MON3/src/mon3.z80
  TETRO_SOURCE: ${{ github.workspace }}/../tetro/src/tetro/tetro.z80
  PACMO_SOURCE: ${{ github.workspace }}/../tetro/src/pacmo/pacmo.z80
```

Locally, the same variables override the maintainer-default paths documented in
`test/asm80/emit_asm80_real_program_acceptance.test.ts`.

Linux CI runs the asm80 parity bundle:

```sh
npm run test:ci:asm80-parity
```

This builds, runs `check:asm80-coverage`, installs `asm80@1.11.14` when needed,
runs promoted lowered-output self-checks and `asm80-external-roundtrip`, and
enables real-program lowering acceptance when `MON3_SOURCE` / `TETRO_SOURCE` /
`PACMO_SOURCE` are configured.

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
differences. Missing `asm80`, missing Tetro/Pacmo entries, and the currently
unconfigured MON3 corpus entry are reported as `SKIP` rather than guessed.

Run the opt-in external ASM80 baseline when touching ASM80 parsing, lowering,
CLI binary output, or ASM80 baseline docs:

```sh
npm run test:asm80:baseline
```

This builds the local AZM CLI, runs the MON3 byte-for-byte acceptance test
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

### Register Contracts Audit

Run register contracts analysis without changing ASM80-baseline output:

```sh
npm run azm -- --rc audit --reg-report path/to/source.z80
```

This writes `path/to/source.regcontracts.txt`. The default mode remains `off`, so
existing ASM80 baseline checks are unchanged unless a register-contracts flag is
supplied.

Run the opt-in Tetro application check when touching loadable binary range
semantics, `DS` behavior, or ASM `EQU` resolution:

```sh
npm run test:asm80:tetro
```

This builds a fresh ASM80 reference from the local Tetro source tree and trims
the ASM80 64K output to the populated listing range before comparing it with
AZM output. Override the default source path and ASM80 executable when needed:

```sh
TETRO_SOURCE=/path/to/tetro/tetro.z80 \
ASM80=/path/to/asm80 \
npm run test:asm80:tetro
```

For docs-only changes, check changed docs paths with Prettier:

```sh
npx prettier -c <changed-doc-paths...>
```

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
