# AZM Tooling API

`@jhlagado/azm` exposes a stable programmatic surface for Node tooling. Use
these imports instead of deep paths under `dist/src`.

Install the package once, then import from the public entry points:

```sh
npm install @jhlagado/azm
```

## Stable entry points

- `@jhlagado/azm`
  Re-exports the stable public surface.
- `@jhlagado/azm/tooling`
  Layer A/B APIs for parsing, loading, diagnostics, spans, and semantics-only analysis.
- `@jhlagado/azm/compile`
  Layer C compile API and default format writers.

## Debug80 Integration Path

Debug80 should link through the public package entry points, not internal
`dist/src/...` paths.

Use this path when Debug80 needs editor-style diagnostics, symbols, or
register-care information without writing files:

```ts
import { analyzeProgram, analyzeRegisterCareForTools, loadProgram } from '@jhlagado/azm/tooling';

const loaded = await loadProgram({
  entryFile: '/abs/path/to/main.asm',
  includeDirs: ['/abs/path/to/includes'],
});

if (!loaded.loadedProgram) {
  return loaded.diagnostics;
}

const analysis = analyzeProgram(loaded.loadedProgram, {
  caseStyle: 'consistent',
  requireMain: false,
});

const registerCare = analyzeRegisterCareForTools(loaded.loadedProgram, {
  mode: 'audit',
  registerCareProfile: 'mon3',
});
```

Use this path when Debug80 needs assembled bytes and debugger metadata:

```ts
import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

const result = await compile(
  '/abs/path/to/main.asm',
  {
    includeDirs: ['/abs/path/to/includes'],
    sourceRoot: '/abs/path/to/project',
    d8mInputs: {
      listing: '/abs/path/to/project/build/main.lst',
      hex: '/abs/path/to/project/build/main.hex',
      bin: '/abs/path/to/project/build/main.bin',
    },
    outputType: 'hex',
    emitBin: true,
    emitHex: true,
    emitD8m: true,
    emitListing: true,
    registerCare: 'audit',
    registerCareInterfaces: ['/abs/path/to/mon3.asmi'],
  },
  { formats: defaultFormatWriters },
);

const diagnostics = result.diagnostics;
const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
const binary = result.artifacts.find((artifact) => artifact.kind === 'bin');
```

The integration contract is:

- source entries are `.asm` or `.z80`
- external register-care contracts are `.asmi`
- include search paths are supplied explicitly with `includeDirs`
- directive alias JSON files are supplied explicitly with `directiveAliasFiles`
- `compile()` returns artifacts in memory; the CLI is only responsible for
  writing those artifacts to disk
- Debug80 should consume the `d8m` artifact for source/address metadata and the
  `bin` artifact for loadable bytes (hex is acceptable when bin is not emitted)
- Do not rely on lowered `.z80` for Debug80 integration until asm80 coverage is
  complete; use **bin + d8m** as the supported debugger path
- pass `sourceRoot` so D8 file keys are stable project-relative source paths
  rather than basename-only paths
- pass `d8mInputs` when Debug80 knows the intended artifact paths; AZM records
  those under `generator.inputs`
- D8 constants use `value` without `address`; only labels and addressable data
  are breakpoint anchors
- diagnostics are data objects and should be displayed directly rather than
  parsed from CLI text

## D8 Debug Map Shape

The D8 artifact is typed as `D8mArtifact`, with `json: D8mJson`. Debug80 can
import these types from `@jhlagado/azm/compile`.

```ts
import type { D8mArtifact, D8mJson, D8mSymbol } from '@jhlagado/azm/compile';
```

The top-level map contains:

```ts
{
  format: 'd8-debug-map',
  version: 1,
  arch: 'z80',
  addressWidth: 16,
  endianness: 'little',
  generator: {
    name: 'azm',
    tool: 'azm',
    version: '0.1.1',
    inputs: {
      entry: 'src/pacmo/pacmo.z80',
      listing: 'build/pacmo.lst',
      hex: 'build/pacmo.hex',
      bin: 'build/pacmo.bin',
    },
  },
  files: {
    'src/pacmo/pacmo.z80': {
      segments: [],
      symbols: [],
    },
  },
  segments: [],
  symbols: [],
}
```

Constants and labels intentionally have different shapes:

```ts
{ name: 'ColorRed', kind: 'constant', value: 1 }
{ name: 'main', kind: 'label', address: 0x4000 }
```

A constant value is not a breakpoint address. Debug80 should use labels and
addressable data symbols as breakpoint anchors.

## Layer A: Load and Parse

Use `loadProgram()` when you need the same AST, spans, and diagnostics that the compiler uses, but without lowering or writing artifacts.

```ts
import { loadProgram } from '@jhlagado/azm/tooling';

const result = await loadProgram({
  entryFile: '/abs/path/to/main.asm',
  includeDirs: ['/abs/path/to/includes'],
  preloadedText: 'ORG 0100H\\nSTART:\\n    RET\\n',
});

if (result.loadedProgram) {
  console.log(result.loadedProgram.program.kind); // "Program"
}

for (const diagnostic of result.diagnostics) {
  console.log(diagnostic.id, diagnostic.message);
}
```

Notes:

- `preloadedText` applies to the entry file only. This is intended for unsaved editor buffers.
- `signal?: AbortSignal` is accepted for best-effort cancellation of stale editor work.
- `parseEntryOnly` is not part of v1. Use `loadProgram()` and debounce at the caller when needed.

## Layer B: Analyze Without Emitting

Use `analyzeProgram()` after `loadProgram()` to run the current non-codegen semantic checks:

- entry contract validation such as `requireMain`
- case-style linting
- environment building
- instruction acceptance checks that do not require lowering

```ts
import { analyzeProgram, loadProgram } from '@jhlagado/azm/tooling';

const loaded = await loadProgram({ entryFile: '/abs/path/to/main.asm' });
if (!loaded.loadedProgram) {
  throw new Error('Parse/load failed');
}

const analysis = analyzeProgram(loaded.loadedProgram, {
  caseStyle: 'consistent',
  requireMain: true,
});

console.log(analysis.diagnostics);
```

`analysis.env` is returned only when semantic analysis completes without errors.

## Register-Care Tooling

Use `analyzeRegisterCareForTools()` after `loadProgram()` when an editor, lint runner, or future LSP server needs register-care diagnostics without parsing report text. The function returns the same inferred output candidates used by the CLI report, plus ready-to-apply quick-fix metadata for confirming intent at the call site.

```ts
import { analyzeRegisterCareForTools, loadProgram } from '@jhlagado/azm/tooling';

const loaded = await loadProgram({ entryFile: '/abs/path/to/main.z80' });
if (!loaded.loadedProgram) {
  throw new Error('Parse/load failed');
}

const registerCare = analyzeRegisterCareForTools(loaded.loadedProgram, {
  mode: 'audit',
  registerCareProfile: 'mon3',
});

for (const diagnostic of registerCare.candidateDiagnostics) {
  console.log(diagnostic.file, diagnostic.line, diagnostic.message);
  console.log(diagnostic.autoFixable); // true when CLI --fix can safely add the hint
  if (diagnostic.autoFixable && diagnostic.codeAction) {
    console.log(diagnostic.codeAction.edit.text); // "; expects out A\n"
  }
}
```

Candidate diagnostics use `kind: "register-care-output-candidate"` and `severity: "info"`.
The `autoFixable` flag distinguishes direct continuation reads that `--fix` may
confirm automatically from cases that need programmer review. Code actions are
intentionally simple text insertions: insert the supplied newline-terminated
`text` at column 1 of the supplied `line`, so the hint is inserted above the call
instruction. This keeps CLI, editor light-bulbs, and future LSP integrations
aligned around one inference source.

## Layer C: Full Compile

Use `compile()` when you want assembly plus output artifacts.

```ts
import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

const result = await compile(
  '/abs/path/to/main.asm',
  { outputType: 'hex', emitAsm80: true },
  { formats: defaultFormatWriters },
);
```

**`emitAsm80` caveat:** Lowered `.z80` emission is gated but not universal.
Unsupported instructions or operand forms throw `UnsupportedAsm80LoweringError`,
surfaced as `AZMN_ASM80`. When assembly already succeeded, `compile()` still
returns bin/hex/d8/listing artifacts alongside the asm80 error. Run
`npm run check:asm80-coverage` on your sources before relying on lowered output.

The compiler accepts flat `.asm` / `.z80` source, retained AZM assembler
features, and the same output writers used by the CLI. External register-care
interfaces are `.asmi` metadata files, not compile entry files.

Retained AZM features include the ASM80 baseline, compact AZMDoc `;!` comments,
directive aliases, AST `op` declarations, enums, `.type` / `.union`, `sizeof`,
`offset`, constant-only layout casts, and scalar type shorthand in `.ds` and
`.field`.

High-level ZAX constructs such as modules/imports, `func`, locals, formal args,
typed assignment/storage lowering, named sections, structured control, and
generated frames are outside this API contract for AZM source.

## Public Types

The public tooling surface includes:

- `Diagnostic`, `DiagnosticIds`, severity/id types
- `LoadedProgram`
- `AnalyzeProgramResult`, `LoadProgramResult`
- `RegisterCareCandidateDiagnostic`, `RegisterCareCodeAction`, `RegisterCareOutputCandidate`

The public tooling contract is the package export surface, not deep internal
paths. Do not document retired internal modules as public API.

## Syntax Highlighting Example

Syntax colouring is an example consumer of the tooling API:

1. Call `loadProgram()` with the file path and optional unsaved buffer text.
2. Walk `ProgramNode` and inspect `node.kind` plus `node.span`.
3. Map those spans to TextMate scopes or semantic token kinds in the editor.
4. Fall back to regex/TextMate-only colouring if parsing fails or the editor needs a cheaper fast path.

The same spans and node kinds also support outline views, hover preparation, diagnostics, and navigation features.

## Migration From Deep Imports

Replace unstable imports such as:

```ts
import { loadProgram } from '@jhlagado/azm/dist/src/sourceLoader.js';
```

with:

```ts
import { loadProgram } from '@jhlagado/azm/tooling';
```

Likewise, prefer `@jhlagado/azm/compile` over `@jhlagado/azm/dist/src/compile.js`.

## Semver Policy

- Patch: bug fixes that preserve the intent of exported APIs and types
- Minor: additive exports, additive AST fields, new optional options
- Major: breaking changes to exported types, AST node shapes, or public function behavior
