# AZM Next Stage 11 Evidence: Source Host and Tooling API

Status: first source-host and tooling API slice implemented

Stage 11 makes AZM Next usable through a programming API for loading and
analyzing source. This is separate from CLI invocation. Current AZM remains the
behavioral oracle.

## Evidence Inspected

- `docs/reference/tooling-api.md`
- `test/public_api_surface.test.ts`
- `test/sourceLoader_asm_include.test.ts`
- `src/api-tooling.ts`
- `src/sourceLoader.ts`
- include-related CLI/source-loader failure tests

## Proven Current AZM Behavior

The public tooling entry point exposes `loadProgram()` and `analyzeProgram()`.
The current package tests prove callers can import these functions from the
stable tooling subpath and use preloaded entry text without writing artifacts.

The current tooling docs and source loader prove these retained options:

- `entryFile`
- `includeDirs`
- `preloadedText`
- `signal?: AbortSignal`

`preloadedText` applies only to the entry file. Includes are loaded through the
filesystem, first relative to the including file and then through explicit
include directories.

Current include tests prove that quoted textual includes are expanded before
parsing, directive aliases inside included files are visible to the including
source, and include file extension is not constrained the same way as the entry
source extension.

Current public API tests prove `loadProgram()` returns diagnostics plus an
optional loaded program, and `analyzeProgram()` can run on the loaded program
without emitting artifacts.

## Implemented AZM Next Boundary

This stage implements the first AZM Next tooling API slice:

- `loadProgramNext(options)`
- `analyzeProgramNext(loadedProgram)`
- stable-name aliases `loadProgram(options)` and `analyzeProgram(loadedProgram)`
- `next/src/api-tooling.ts` as the future `@jhlagado/azm/tooling` entry module
- stable tooling type aliases for `LoadedProgram`, `LoadProgramOptions`,
  `LoadProgramResult`, and `AnalyzeProgramResult`

The source host supports:

- entry files ending in `.asm` or `.z80`
- explicit include directories
- quoted `.include "file"` textual includes
- preloaded entry text
- best-effort `AbortSignal` cancellation via `throwIfAborted()`
- source text tracking for entry and included files
- source-line comment tracking for entry and included files
- included-file parse diagnostic provenance

`loadProgramNext()` returns a retained program model with parsed source items
and source text maps. `analyzeProgramNext()` assembles the parsed source items
only far enough to return diagnostics and a symbol environment for the current
Stage 11 API tests; it does not write artifacts.

## Deferred Behavior

This stage does not yet implement the final public package subpath layout,
root re-exports, full AST/type parity, register-care tooling, or compile API
artifact parity. Those are assigned to Stages 12-16 in
`next/docs/implementation-plan.md`.

## Tests Added

- `next/test/integration/stage-11-tooling-api.test.ts`

The tests cover:

- preloaded entry text through the programming API
- include expansion through explicit include directories
- included-file parse diagnostic provenance
- unsupported entry extension diagnostics
- `analyzeProgramNext()` returning a symbol environment without CLI invocation
- stable public tooling names exported from the root entry point
- stable public tooling type aliases exported from the root entry point
