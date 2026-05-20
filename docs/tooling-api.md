# AZM Tooling API

`@jhlagado/azm` exposes a stable programmatic surface for Node tooling. Use these imports instead of deep paths under `dist/src`.

## Stable entry points

- `@jhlagado/azm`
  Re-exports the stable public surface.
- `@jhlagado/azm/tooling`
  Layer A/B APIs for parsing, loading, diagnostics, spans, and semantics-only analysis.
- `@jhlagado/azm/compile`
  Layer C compile API and default format writers.

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
  profile: 'mon3',
});

for (const diagnostic of registerCare.candidateDiagnostics) {
  console.log(diagnostic.file, diagnostic.line, diagnostic.message);
  console.log(diagnostic.autoFixable); // true when CLI --fix can safely add the hint
  console.log(diagnostic.codeAction.edit.text); // "; expects out A\n"
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

Use `compile()` when you want lowering plus output artifacts.

```ts
import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

const result = await compile(
  '/abs/path/to/main.asm',
  { emitAsm80: true },
  { formats: defaultFormatWriters },
);
```

## Public Types

The public tooling surface includes:

- `Diagnostic`, `DiagnosticIds`, severity/id types
- `SourcePosition`, `SourceSpan`
- `ProgramNode`, `ModuleFileNode`, `ModuleItemNode`
- `LoadedProgram`
- `CompileEnv`
- `RegisterCareCandidateDiagnostic`, `RegisterCareCodeAction`, `RegisterCareOutputCandidate`

In v1, the AST exported from `src/frontend/ast.ts` is part of the public contract. Additive fields are minor-version changes; breaking shape changes are major-version changes.

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
import { loadProgram } from '@jhlagado/azm/dist/src/moduleLoader.js';
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
