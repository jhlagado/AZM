---
layout: default
title: 'Chapter 5 - Interfaces and Output Artifacts'
parent: 'AZM Engineering Manual'
nav_order: 5
---

[<- Ops and Register Contracts](04-ops-and-register-contracts.md) | [Verification and Maintenance ->](06-verification-and-maintenance.md)

# Chapter 5 - Interfaces and Output Artifacts

AZM has three public entry surfaces: the command-line binary, the compile API
and the tooling API. They all use the same compiler pipeline. Output writers
then serialize assembled facts for users, Debug80 and package consumers.

This chapter covers the boundary between the compiler and its callers: package
exports, CLI flow, public TypeScript APIs and artifact shapes.

## Package Exports

`package.json` exposes:

```text
@jhlagado/azm
@jhlagado/azm/compile
@jhlagado/azm/tooling
@jhlagado/azm/cli
@jhlagado/azm/package.json
```

`src/index.ts` re-exports the stable public surface. `src/api-compile.ts` backs
`@jhlagado/azm/compile`. `src/api-artifacts.ts` isolates assembly artifact
creation for the compile API. `src/api-register-contracts.ts` isolates register contract
analysis, interface loading and register contract artifact creation.
`src/api-tooling.ts` backs `@jhlagado/azm/tooling`. `src/cli.ts` is the
executable entry.

The root export gives consumers a broad import. The `/compile` path is the
build-system path. The `/tooling` path is the editor and analysis path. The
`/cli` path backs the executable entry. The `/package.json` path exposes package
metadata for tools that need the installed version.

## CLI Flow

The executable path in `package.json` points to `dist/src/cli.js`, compiled from
`src/cli.ts`. That file calls `runCli(process.argv.slice(2))` and sets the
process exit code.

`src/cli/run.ts` owns the CLI control flow:

```text
runCli(argv)
  parseCliArgs(argv)
  artifactBase(entryFile, outputType, outputPath)
  compile(entryFile, buildCompileOptions(parsed, base))
  sort and print diagnostics
  writeArtifacts(base, artifacts, outputType)
  return exit code
```

The CLI returns `0` for a successful assembly, `1` when diagnostics include an
error and `2` for argument or unexpected runtime failures. Diagnostics are
printed to standard error. The primary output path is printed to standard output
when artifact writing succeeds.

`src/cli/parse-args.ts` parses switches and validates the command shape.
`src/cli/usage.ts` owns help text. The parser recognises output selection,
artifact suppression, include paths, source-root, case-style linting, directive
aliases and register contract options.

`src/cli/write-artifacts.ts` maps parsed options into
`CompileNextFunctionOptions` and calculates the output stem.
`src/cli/artifact-files.ts` writes in-memory artifacts to disk. If the user
supplies `--output build/program.bin`, the primary artifact is written to that
path and side artifacts use the same base. If the user supplies only
`program.asm`, AZM writes outputs next to the entry source using the source
stem.

## Compile API

`src/api-compile.ts` exports:

```ts
export async function compile(
  entryFile: string,
  options: CompileNextFunctionOptions = {},
  deps: CompileNextDependencies = { formats: defaultFormatWriters },
): Promise<CompileNextResult>;
```

The compile API is file-backed. It reads source from disk, expands includes,
analyses the program, assembles it and returns artifacts in memory.

Important options include:

| Option                                       | Meaning                                 |
| -------------------------------------------- | --------------------------------------- |
| `includeDirs`                                | Include search paths.                   |
| `directiveAliasFiles`                        | Project alias profile files.            |
| `caseStyle`                                  | Case-style lint mode.                   |
| `outputType`                                 | Primary output type, `hex` or `bin`.    |
| `sourceRoot`                                 | Root used for portable D8 map paths.    |
| `d8mInputs`                                  | Artifact paths recorded in D8 metadata. |
| `emitBin`, `emitHex`, `emitD8m`, `emitAsm80` | Artifact selection.                     |
| `registerContracts`                          | Register contract mode.                 |
| `emitRegisterReport`                         | Emit `.regcontracts.txt` artifact.      |
| `emitRegisterInterface`                      | Emit `.asmi` artifact.                  |
| `emitRegisterAnnotations`                    | Emit source annotation artifact.        |
| `fixRegisterContracts`                       | Apply conservative source fixes.        |
| `acceptRegisterOutputCandidates`             | Promote selected output candidates.     |
| `registerContractsProfile`                   | Built-in external contract profile.     |
| `registerContractsInterfaces`                | External `.asmi` contract files.        |
| `skipAssembly`                               | Run loading and analysis only.          |

`compile()` returns:

```ts
export interface CompileNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly Artifact[];
}
```

Diagnostics describe every warning or error observed during loading, analysis,
register contract analysis, assembly or artifact creation. Artifacts contain the
in-memory outputs requested by options.

The older option names `registerCare`, `registerCareProfile` and
`registerCareInterfaces` remain as deprecated aliases for package consumers.
New callers should use the `registerContracts...` names.

## Tooling API

`src/tooling/api.ts` exports `loadProgramNext()` and `analyzeProgramNext()`.
`src/api-tooling.ts` re-exports those functions with register contract tooling
helpers.

`loadProgramNext()` returns a loaded program with source items, source texts and
source line comments. `analyzeProgramNext()` runs semantic checks and returns
symbols. `analyzeRegisterContractsForTools()` returns register contract
diagnostics and code actions in a form suitable for editors.

The tooling loader now recognises both `.include` and `.import`. Both directives
flatten source into one parse stream. `.import` also marks parsed spans with a
new source ownership unit, while `.include` keeps the surrounding owner's unit.
Editor features can use `item.span.sourceUnit` and `item.span.sourceRelation`
to distinguish module-owned declarations from text included into another unit.

An editor integration usually starts with:

```ts
const loaded = await loadProgramNext({
  entryFile: '/project/src/main.asm',
  includeDirs: ['/project/include'],
  preloadedText: editorText,
});
```

When `loaded.loadedProgram` is present, the editor can call
`analyzeProgramNext()` for symbols and case-style diagnostics. It can also call
`analyzeRegisterContractsForTools()` for register contract candidate diagnostics
and code actions.

## Artifact Types

The output layer uses structured artifact objects from `src/outputs/types.ts`:

- `BinArtifact`
- `HexArtifact`
- `D8mArtifact`
- `Asm80Artifact`
- `RegisterContractsReportArtifact`
- `RegisterContractsInterfaceArtifact`
- `RegisterContractsAnnotationsArtifact`

Each artifact has a `kind` field. Callers can switch on `kind` to find the
artifact they need:

```ts
const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
const bin = result.artifacts.find((artifact) => artifact.kind === 'bin');
```

This shape keeps the compile API independent from output paths. A caller can
write artifacts to disk, keep them in memory, send them to another process or
compare them in a test.

## Byte Maps, BIN and HEX

Assembly produces an `EmittedByteMap`. It represents sparse output: addresses
map to byte values and source segments describe where those bytes came from.

`src/outputs/range.ts` provides range helpers. `getWrittenSegments()` identifies
contiguous written address ranges. `getWrittenRange()` returns the overall
written span.

`src/outputs/write-bin.ts` writes flat binary. It chooses the written range,
fills gaps as needed and returns a `Uint8Array` artifact.
`src/outputs/write-hex.ts` wraps `src/outputs/hex.ts`, which writes Intel HEX
records and checksums.

## D8 Debug Maps

`src/outputs/write-d8.ts` writes Debug80 metadata. It records generator details,
input artifact paths, source files, source segments, addressable symbols and
value-only constants.

The writer normalizes source paths through `sourceRoot` when provided. It also
coalesces source segments and clips them to written ranges so Debug80 receives a
clean map of source lines to emitted bytes.

The D8 map distinguishes addressable symbols from constants. Labels and
addressable data carry addresses. Constants carry values. Debug80 can then use
addressable symbols for breakpoints and display constants as metadata.

## Lowered ASM80 and Register Contract Artifacts

`src/outputs/write-asm80.ts` serializes accepted AZM source items as
ASM80-compatible `.z80` text. It lowers supported AZM constructs into forms that
can be compared against ASM80 output. The writer is larger than the other
writers because it turns structured items back into source text.

Register contract report, interface and annotation artifacts are created through
`runRegisterContracts()` in `src/api-register-contracts.ts` and flow through
the same compile result and CLI write path. The report is human-readable. The `.asmi`
interface is metadata that can be loaded by later compile runs through
`--interface`. Annotation artifacts write source files when `--contracts` or
`--fix` is used.

## Public API Compatibility

The public API is defined by package exports and exported TypeScript types.
Major-version planning is the point where these shapes can change:

- exported function names
- option object property names
- result object shapes
- artifact kinds
- diagnostic object shape
- D8 map type exports
- register contract tooling result shapes

The type tests are the safety net for this boundary. When a public type changes,
the change should be intentional and reflected in package documentation.
