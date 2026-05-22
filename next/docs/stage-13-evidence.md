# AZM Next Stage 13 Evidence: CLI Facade and Output Invocation Slice

Status: first CLI-wrapper slice implemented

Stage 13 implements a CLI compatibility layer that drives the Stage 12 compile API
and writes artifacts to disk according to current AZM CLI contracts.

## Evidence Inspected

- `test/cli/cli_contract_matrix.test.ts`
- `test/cli/cli_artifacts.test.ts`
- `test/cli/cli_failure_contract_matrix.test.ts`
- `test/cli/cli_path_parity_contract.test.ts`
- `test/cli/cli_source_extension.test.ts`
- `test/cli/cli_acceptance_matrix_strictness.test.ts`
- `src/cli.ts`
- `src/compile.ts`
- `src/pathCompare.ts`
- `test/helpers/cli/index.ts`
- `test/helpers/cli/build.ts`

## Proven Current AZM Behavior Bound to Stage 13

- CLI options with help/version fast-paths:
  - `--help` prints usage text and exits 0.
  - `--version` prints package version and exits 0.
- CLI contract:
  - exactly one entry path is required;
  - entry must be last argument.
  - `-o/--output`, `--type`, and `-I/--include` require a value and emit usage-level
    errors when missing.
- Source extension validation for entry:
  - `.asm` and `.z80` only.
- Primary output behavior:
  - `--type` accepts `hex|bin`.
  - `--output` extension must match selected `--type` (`.hex` / `.bin`, case-insensitive check).
  - `--type hex` cannot be used when hex output is explicitly disabled.
  - `--type bin` cannot be used when bin output is explicitly disabled.
  - uppercase output extensions are accepted and canonicalized to lowercase artifact names on write.
- Artifact emission:
  - write `.hex`, `.bin`, `.d8.json`, `.lst` by default.
  - default `--type` is `hex`; with no explicit `-o` output path, output stem is entry stem.
  - write `--nod8m`, `--nobin`, `--nohex`, `--nolist` suppressions.
  - emit `.z80` only with `--asm80`.
  - nested output directories are created before writing.
- Exit behavior:
  - usage parsing errors exit `2` and include usage text.
  - compiler errors exit `1` and do not write artifacts.
  - parse/IO failures print `azm: <message>` plus usage.
- Diagnostics are sorted and written in stable file/line/severity order to stderr.

## Implemented AZM Next Boundary

Added `next/src/cli.ts` with:

- argument parser supporting:
  - `-h/--help`, `-V/--version`
  - `-o/--output`, `-t/--type`, `-n/--nolist`, `--nobin`, `--nohex`, `--nod8m`, `--asm80`
  - `--source-root`, `-I/--include`
- thin assembly pipeline integration:
  - calls `compile(entry, CompileNextFunctionOptions)` from `next/src/api-compile.ts`
  - forwards include dirs, source-root, artifact toggles, and asm80 flag
  - uses default package version for `--version`
- artifact sink:
  - maps compiler artifact kinds to `.hex`/`.bin`/`.d8.json`/`.lst`/`.z80`.
  - writes files only for emitted artifacts.
  - prints canonical primary output path to stdout.

## Evidence-backed Tests Added

- `next/test/integration/stage-13-cli.test.ts`

## Deferred / Out of Scope for Stage 13

- case-style lint flags, register-care flags/options, and any behavior not covered by this slice.
- exact runtime parity for every retained flag accepted by the current CLI.
- direct invocation packaging flow for `bin.azm` (this stage validates the implementation surface and behavior within `next/`).
