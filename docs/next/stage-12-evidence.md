# AZM Next Stage 12 Evidence: Public Compile API and Output Parity Slice

Status: first compile API/API-output slice implemented

Stage 12 is the first pass that makes AZM Next a library-friendly compile API
matching the current AZM public contract for in-memory artifacts.

## Evidence Inspected

- `test/public_api_surface.test.ts`
- `test/cli/cli_artifacts.test.ts`
- `test/cli/cli_path_parity_contract.test.ts`
- `test/cli/cli_acceptance_matrix_strictness.test.ts`
- `test/determinism_artifacts.test.ts`
- `test/fixtures/virtual_public_api_compile.asm`
- `src/compile.ts`
- `src/formats/index.ts`
- `src/formats/types.ts`
- `src/formats/writeBin.ts`
- `src/formats/writeHex.ts`
- `src/formats/writeD8m.ts`
- `docs/reference/tooling-api.md`

## Proven Current AZM Behavior

- `@jhlagado/azm/compile` is the public compile entry point for programmatic
  assembly and artifacts.
- API output is deterministic across repeated compiles for the same entry file
  and options.
- With default options and listing enabled, the core artifact kinds are:

  1. `bin`
  2. `hex`
  3. `d8m`

- If artifact flags are suppressed, defaults and sidecar behavior follow:
  - `emitBin: false` suppresses only the BIN artifact.
  - `emitHex: false` suppresses only the HEX artifact.
- If any primary output flag is explicitly provided (`emitBin`/`emitHex`/`emitD8m`),
  unspecified primary flags default to `false`. In that mode, only explicitly true
  primary flags are emitted.
- Current compile API returns an empty artifact set whenever diagnostics contain
  at least one error.
- D8 metadata records:
  - `generator.name = "azm"`
  - `generator.tool = "azm"`
  - `generator.version` equals package version.
  - `generator.inputs` includes normalized file paths when `sourceRoot` and
    `d8mInputs` are provided.
  - default entry symbol handling is driven by the resolved `main` symbol.
- `asm80` output is optional and should be present only when explicitly
  requested (`emitAsm80: true`).

## Implemented AZM Next Boundary

This stage adds a new API module and a stable index surface for stage 12:

- `next/src/api-compile.ts`
- `next/src/index.ts` exports:
  - `compile`
  - `compile` dependency shape
  - `defaultFormatWriters`
  - `writeHex`
  - compile result/dependency/options types
- `next/src/outputs/*` with explicit in-memory writer contracts for:
  - BIN (`writeBin`)
  - HEX (`writeHex`)
  - D8 (`writeD8m`)
  - LISTING (`writeListing`)
  - ASM80 stub (`writeAsm80`)

The implemented compile flow is:

1. load + analyze entry source with `loadProgramNext` / `analyzeProgramNext`
2. return early with no artifacts on any diagnostics of error severity
3. assemble symbols + image in-memory
4. map internal symbol rows (`constant`, `label`, nested enum members) into artifact symbol entries
5. emit requested artifacts through injected writers

Defaults are:

- primary artifacts (`bin`, `hex`, `d8m`) default to `true` only when no primary
  flags are explicitly supplied.
- listing defaults to `true`.
- asm80 defaults to `false`.

## Deferred / Partial Behavior

- `asm80` lowering is intentionally stubbed in this stage; it currently provides
  a stable artifact shape and does not yet provide lowered `.z80` parity.
- Source-root and symbol/path canonicalization behavior is implemented for D8 inputs
  using a normalized root and slash-normalized relative paths.

## Tests Added

- `next/test/integration/stage-12-compile-api.test.ts`

The tests cover:

- default artifact kinds/order for the programming API with empty option set
- primary artifact suppression (`emitHex`, `emitBin`, `emitD8m`) and preserved
  listing behavior
- no artifacts on diagnostics with errors
- D8 metadata normalization (`inputs`, `entrySymbol`, `entryAddress`, files)
- optional `asm80` artifact emission with enabled option
- deterministic artifact behavior across repeated compiles
