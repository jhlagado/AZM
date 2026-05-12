# ZAX Tooling API

`@jhlagado/zax` exposes a stable programmatic surface for Node tooling. Use these imports instead of deep paths under `dist/src`.

## Stable entry points

- `@jhlagado/zax`
  Re-exports the stable public surface.
- `@jhlagado/zax/tooling`
  Layer A/B APIs for parsing, loading, diagnostics, spans, and semantics-only analysis.
- `@jhlagado/zax/compile`
  Layer C compile API and default format writers.

## Layer A: Load and Parse

Use `loadProgram()` when you need the same AST, spans, and diagnostics that the compiler uses, but without lowering or writing artifacts.

```ts
import { loadProgram } from '@jhlagado/zax/tooling';

const result = await loadProgram({
  entryFile: '/abs/path/to/main.zax',
  includeDirs: ['/abs/path/to/includes'],
  preloadedText: 'export func main()\\nend\\n',
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
import { analyzeProgram, loadProgram } from '@jhlagado/zax/tooling';

const loaded = await loadProgram({ entryFile: '/abs/path/to/main.zax' });
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

## Layer C: Full Compile

Use `compile()` when you want lowering plus output artifacts.

```ts
import { compile, defaultFormatWriters } from '@jhlagado/zax/compile';

const result = await compile(
  '/abs/path/to/main.zax',
  { emitAsm80: true },
  { formats: defaultFormatWriters },
);
```

## Public Types

The public tooling surface includes:

- `Diagnostic`, `DiagnosticIds`, severity/id types
- `SourcePosition`, `SourceSpan`
- `ProgramNode`, `ModuleFileNode`, `ModuleItemNode`, `SectionItemNode`
- `LoadedProgram`
- `CompileEnv`

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
import { loadProgram } from '@jhlagado/zax/dist/src/moduleLoader.js';
```

with:

```ts
import { loadProgram } from '@jhlagado/zax/tooling';
```

Likewise, prefer `@jhlagado/zax/compile` over `@jhlagado/zax/dist/src/compile.js`.

## Semver Policy

- Patch: bug fixes that preserve the intent of exported APIs and types
- Minor: additive exports, additive AST fields, new optional options
- Major: breaking changes to exported types, AST node shapes, or public function behavior
