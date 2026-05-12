# Specification: ZAX programmatic API surface (`@jhlagado/zax`)

**Status:** Draft for implementation
**Audience:** Implementers (including automated coding agents) and consumers (Debug80, VS Code extensions, other Node tooling)
**Scope:** Refactor and extend the `@jhlagado/zax` npm package so it exposes a **stable programming-level interface** for language services—not only compilation via CLI or a single `compile()` entry point.

---

## 1. Purpose and goals

### 1.1 Problem

Today `@jhlagado/zax` is primarily consumed as:

- A **CLI** (`zax` → `dist/src/cli.js`), and
- Occasional **deep imports** into `dist/src/*.js` (e.g. `compile`, `moduleLoader`), which are **not** a supported contract.

Dependents that want **language awareness** (highlighting, navigation, diagnostics in an editor, CI lint without emitting binaries, etc.) must either:

- Shell out to the CLI and parse text output, or
- Import unstable internal modules.

Neither is acceptable for long-term, parallel development across repositories (e.g. Debug80, future `vscode-zax`).

### 1.2 Goal

Provide a **first-class programmatic surface** so that any Node consumer that adds `@jhlagado/zax` as a dependency can:

1. Use **documented, semver-governed** exports.
2. Obtain **parse trees, spans, and diagnostics** (and optionally **semantic analysis short of full codegen**) without running the full emit pipeline unless requested.
3. Build **tooling** (syntax colouring, hover, outline, rename prep, etc.) on the **same** parser and AST as the assembler—**one source of truth**.

This spec deliberately treats **syntax highlighting** as an **example** consumer of spans + node kinds, not the only feature: the API must be **general** enough for any tool that needs structure and positions.

### 1.3 Non-goals (initial phase)

- **LSP server** inside this package (could be a separate package that *uses* this API).
- **Incremental parsing** or sub-10ms guarantees on every keystroke (may be future work; v1 may use debounced full-file parse).
- **Guaranteed** partial/invalid-document AST shape for every syntax error (improve error recovery in later iterations; v1 should document behavior on error).

---

## 2. Design principles

1. **Programming surface, not CLI surface**
   The CLI remains; it should call into the same public API where practical to avoid duplication.

2. **Stable exports**
   Use `package.json` **`exports`** map. No reliance on deep paths like `@jhlagado/zax/dist/src/moduleLoader.js` from consumers.

3. **Explicit versioning of “tooling” types**
   If full AST stability is too heavy for early semver, introduce a **`ToolingView`** or **narrowed DTOs** (kinds + spans + minimal fields) that are versioned separately from internal `ast.ts` refactors—or document that `ast` types are **public** and subject to semver rules.

4. **Layered API**

   - **Layer A — Parse / load:** text → structured program (with diagnostics).
   - **Layer B — Analyze:** optional semantics (symbols, types) without codegen.
   - **Layer C — Compile:** existing full pipeline (emit artifacts).

   Dependents choose the shallowest layer they need.

5. **Performance expectations (documented)**
   Full-program analysis may be acceptable for save, pre-commit, or debounced editor jobs; not necessarily for every keypress. Document typical costs and recommend **debouncing** and **cancellation** (AbortSignal) where feasible.

---

## 3. Current implementation facts (for implementers)

These are anchors; verify against current tree during implementation:

- **`compile`** in `src/compile.ts` runs `loadProgram` → semantics → lowering → formats.
- **`loadProgram`** in `src/moduleLoader.ts` returns `LoadedProgram` including `program: ProgramNode`, `sourceTexts`, `resolvedImportGraph`, etc.
- **AST** in `src/frontend/ast.ts`: nodes extend `BaseNode` with `span: SourceSpan` (`file`, `start`, `end` with line/column/offset).
- **Diagnostics** in `src/diagnosticTypes.ts` (and related) are already structured.

The refactor is largely **encapsulation, export policy, and optional shallow entry points**, not rewriting the parser.

---

## 4. Package layout and `exports`

### 4.1 `package.json` requirements

- Add **`exports`** (and optionally **`types`** conditions) so that at minimum:

  | Subpath              | Purpose                                      |
  |----------------------|----------------------------------------------|
  | `@jhlagado/zax`      | Default entry: document what it re-exports   |
  | `@jhlagado/zax/compile` | Full compile API (existing)               |
  | `@jhlagado/zax/tooling` | Parse/load/analyze for tools (new or consolidated) |

  Exact names are up to implementers but must be **documented** and **stable**.

- **`files`** in published tarball must include everything needed for those entry points (already `dist/src`; ensure new barrels are emitted).

- **Avoid** breaking existing CLI; **bin** stays `dist/src/cli.js`.

### 4.2 Barrel modules

Introduce explicit barrels (e.g. `src/api-tooling.ts`, `src/api-compile.ts`, or a single `src/public-api.ts`) that **only** re-export approved symbols. Internal modules remain importable only from inside the package during build—not part of the public contract.

---

## 5. API surface (normative intent)

### 5.1 Types to expose (minimum)

- **Diagnostics:** `Diagnostic`, severity, ids, file/line/column as today (stable names).
- **Spans / positions:** `SourceSpan`, `SourcePosition` (from AST module or a thin duplicate if needed for decoupling).
- **Program tree:** Either:
  - **Option A:** Export `ProgramNode`, `ModuleFileNode`, and discriminated `ModuleItemNode` / `SectionItemNode` unions from `ast.ts` as **public** (with semver discipline), or
  - **Option B:** Export a **`ToolingProgram`** DTO that is a stable, simplified projection (larger upfront design, smaller breakage long-term).

The spec **recommends Option A for v1** if the team accepts semver on AST shape changes, because it avoids maintaining two parallel trees. If AST churn is high, add Option B in a later minor version.

### 5.2 Functions to expose (minimum)

1. **`compile`** (existing)
   - Same signature as today; documented as **Layer C**.

2. **`loadProgram` or renamed public wrapper**
   - Async function that resolves entry path, reads files, parses imports, returns `LoadedProgram` + diagnostics.
   - Must support **`preloadedText`** (or equivalent) for an entry file so embedders can pass **unsaved editor buffer** without writing a temp file (confirm `readModuleSource` / loader already supports this path; extend if not).

3. **`parseEntryOnly` (optional v1 or v1.1)**
   - Single-file parse **without** following imports, for quick highlighting when imports are irrelevant—**only if** it can be implemented cheaply on top of existing `parseModuleFile` / parser. If it fragments behavior, defer and document “full load only” for v1.

4. **Semantics-only hook (optional Layer B)**
   - Expose **`buildEnv`** / validation stages **or** a single `analyzeProgram(program, options) -> { diagnostics, envSummary }` that does **not** emit binaries. Exact scope is implementation-defined but must be **documented** (what runs vs full `compile`).

### 5.3 Cancellation

Where async work is non-trivial, accept optional **`AbortSignal`** on new public functions so VS Code hosts can cancel stale requests (best effort).

---

## 6. Example consumer: syntax colouring (non-normative)

**Not** part of the npm package: this lives in Debug80 or `vscode-zax`.

**Idea:**

1. Dependent calls **`loadProgram`** (or parse API) with file path + optional buffer text.
2. Walk **`ProgramNode`** (or public AST types), read **`node.kind`** and **`node.span`**.
3. Map `(kind, contextual parent)` → **TextMate scope** or **Semantic Token type/modifiers** (VS Code API).
4. On failure or performance limits, **fall back** to regex/TextMate grammar for the same file.

This illustrates why **spans + kinds** must be reliable and why the API must be **general**—the same data supports outline, go-to-definition, and inlay hints later.

---

## 7. Semver and compatibility

- **Patch:** bug fixes in parsing/diagnostics that don’t change exported types’ intent.
- **Minor:** additive fields on nodes (if exported), new optional options, new exported helpers.
- **Major:** breaking changes to exported types or default behaviors of `compile` / public loaders.

Publish a short **`docs/tooling-api.md`** (or section in README) listing **stable entry points** and **compatibility policy**.

---

## 8. Testing requirements

- **Unit tests** for public barrels: importing only from `@jhlagado/zax/tooling` (or chosen path) in a **fixture package** or test harness—no deep imports.
- **Golden tests** optional: small `.zax` file → snapshot of serialized spans/kinds for regression detection when parser changes.
- **Existing test suite** must remain green; CLI smoke tests unchanged.

---

## 9. Documentation deliverables

1. **`docs/tooling-api.md`** — how to import, minimal examples (Node ESM), Layer A/B/C explanation.
2. **CHANGELOG** entry describing new exports and any deprecations.
3. **Migration note** for dependents currently using deep imports (e.g. Debug80): “use `@jhlagado/zax/tooling` instead of `.../dist/src/moduleLoader.js`.”

---

## 10. Acceptance criteria

The work is **done** when:

1. `package.json` **`exports`** is present and documents supported import paths.
2. At least one **documented** path returns **`ProgramNode`** (or approved DTO) + **diagnostics** without requiring consumers to import `dist/src/...` directly.
3. **`preloadedText`** (or equivalent) for entry buffer is supported for editor integration, or explicitly deferred with issue link.
4. **Syntax highlighting** is cited in docs as an **example** of consuming spans + kinds; no requirement to ship a highlighter inside ZAX.
5. **Tests** lock the public import surface.
6. **Semver policy** is written down.

---

## 11. References (implementers)

- `src/compile.ts` — full pipeline
- `src/moduleLoader.ts` — `LoadedProgram`, `loadProgram`
- `src/frontend/ast.ts` — AST + spans
- `src/pipeline.ts` — `CompilerOptions`, `CompileResult`
- `package.json` — `files`, `bin`, new `exports`

---

*End of specification.*
