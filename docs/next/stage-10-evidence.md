# AZM Next Stage 10 Evidence: CLI and Output Parity

Status: first output artifact/API slice implemented

This document records the evidence used for the first AZM Next CLI/output
parity slice. The current AZM implementation remains the source of truth for
observable behavior; AZM Next should not infer generic assembler behavior where
AZM tests or docs are silent.

## Evidence Inspected

- `test/public_api_surface.test.ts`
- `test/determinism_artifacts.test.ts`
- `test/cli/cli_artifacts.test.ts`
- `test/cli/cli_contract_matrix.test.ts`
- `test/cli/cli_failure_contract_matrix.test.ts`
- `src/compile.ts`
- `src/cli.ts`
- `src/formats/types.ts`
- `src/formats/index.ts`
- `src/formats/writeHex.ts`
- `src/formats/writeBin.ts`
- `docs/reference/tooling-api.md`

## Proven Current AZM Behavior

### In-Memory Artifacts

The stable `@jhlagado/azm/compile` subpath exposes `compile` and
`defaultFormatWriters`. Current API tests prove that `compile()` returns
diagnostics plus in-memory artifacts when called with format writers. With
listing and ASM80 output disabled, the artifact kind order is:

1. `bin`
2. `hex`
3. `d8m`

The current format writer types prove the artifact payload shapes used by this
Stage 10 slice:

- BIN artifacts have `kind: "bin"` and `bytes: Uint8Array`.
- HEX artifacts have `kind: "hex"` and `text: string`.

`test/determinism_artifacts.test.ts` proves artifact output is expected to be
deterministic across repeated compiles for the same source.

### CLI Artifact Behavior

The current CLI tests prove the CLI writes artifacts to disk; the compile API
returns them in memory. The CLI writes default sibling artifacts for a selected
primary output path, prints the primary output path to stdout on success, and
honors suppression flags such as `--nobin`, `--nohex`, `--nod8m`, and
`--nolist`.

The current CLI tests also prove that when source diagnostics contain errors,
the CLI returns exit code 1, writes diagnostics to stderr, and writes no output
artifacts.

### Diagnostic Formatting

`src/cli.ts` formats source diagnostics as:

```text
file:line:column: severity: [id] message
```

When line or column is unavailable, the current CLI falls back to the diagnostic
file location alone before the severity/code/message portion.

AZM Next diagnostic objects use `code` and `sourceName` field names instead of
current AZM's `id` and `file` field names. The Stage 10 formatter preserves the
observable CLI text shape while using AZM Next's internal diagnostic model.

## Implemented AZM Next Boundary

This stage implements a narrow in-memory output API:

- `compileNextArtifacts(sourceText, options)`
- `formatNextDiagnostic(diagnostic)`

`compileNextArtifacts` reuses the existing `compileNext` assembly result and
returns deterministic artifacts in current-AZM-compatible order for the
implemented kinds:

1. `bin`
2. `hex`

The API supports independent `emitBin: false` and `emitHex: false` suppression.
If any error diagnostic is present, the API returns no artifacts. This matches
the current CLI's no-artifacts-on-error contract while staying in memory.

This stage does not implement file-writing CLI behavior, option parsing,
listing output, D8M output, ASM80 lowering output, package subpaths, or process
exit codes for AZM Next. Those remain future CLI/API parity work.

## Tests Added

- `next/test/integration/stage-10-output.test.ts`

The tests cover:

- default BIN and HEX artifact order and payloads
- independent BIN/HEX suppression
- no artifacts when diagnostics contain errors
- current CLI-style diagnostic formatting
