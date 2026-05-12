# ZAX Codebase Audit — v2

**Date:** 2026-03-06
**Scope:** Full codebase, 21,245 lines of TypeScript across 97 files
**Auditor:** reviewer branch automated analysis

This is a brutal-but-constructive audit focused on code quality, human readability, and the pattern the codebase has drifted into: **a soup of exceptions and alternative paths rather than rigour in adherence to grammar rules.** The goal is to identify what needs to change to turn this into a lean, maintainable compiler.

Issues are grouped by layer. Each has a severity, a one-line title, a diagnosis, and a concrete fix.

---

## Severity legend

| Symbol | Meaning |
| --- | --- |
| 🔴 Critical | Blocks future work; must fix before adding features |
| 🟠 Major | Creates real maintenance pain; should fix soon |
| 🟡 Minor | Worth doing; low urgency |

---

## Parser layer — P-01 to P-05

### P-01 🟠 Duplicate top-level vs section-level dispatch chains

`parser.ts` contains two near-identical if-chains — one for top-level items (lines 557–918) and one for section-level items (lines 205–532) — that recognise the same keywords (`import`, `type`, `union`, `func`, `op`, `extern`, `enum`, `section`, `align`, `const`, `bin`, `hex`) with only minor differences in which are legal where. This means every grammar change has to be applied in two places, and the two places can silently drift apart.

**Fix:** Extract a single `parseModuleItem(ctx)` function that accepts a `context: 'top-level' | 'section'` flag. Illegal items at the wrong level produce a diagnostic; they do not require a separate dispatch chain.

---

### P-02 🟡 Comment-stripping functions duplicated across parser files

`stripComment()` and `stripLineComment()` are re-implemented locally in `parseData.ts`, `parseFunc.ts`, `parseOp.ts`, and `parseAsmStatements.ts`, and also exported from `parseParserShared.ts`. Four copies of the same function.

**Fix:** Remove all local copies. Export from `parseParserShared.ts` only. All parser files import from there.

---

### P-03 🟠 `parseFunc.ts` and `parseOp.ts` parse similar headers via divergent paths

Both functions parse a `name(...)` header followed by trailing tokens, but the paren-matching logic, parameter-list parsing, and trailing-token validation are written independently. The "invalid trailing tokens" check present in `parseOp.ts` (lines 95–101) is absent from `parseFunc.ts`.

**Fix:** Extract `parseHeaderParams(tokens, startIndex) -> { params, nextIndex }` as a shared primitive. Both parsers call it; each then handles its own trailing-token semantics in one small function.

---

### P-04 🟡 Export modifier validation is 70 lines of inline logic

`parseExportModifier()` (parser.ts lines 74–144) mixes detection of invalid export targets with hand-written error messages. Adding a new invalid export target means editing both the detection code and the `unsupportedExportTargetKind` map.

**Fix:** Collapse to a data-driven table: `const INVALID_EXPORT_TARGETS: Record<string, string> = { ... }`. The validator is a single lookup.

---

### P-05 🟡 Error recovery silently skips constructs without follow-up diagnostics

When a parse fails (e.g., invalid func header at parser.ts line 85–93), the parser emits a diagnostic and advances by one token. There is no indication of what was skipped or where the parser resumed. This makes it hard to interpret multiple errors in a single file.

**Fix:** On recovery, emit a second diagnostic: `"Skipped malformed <construct>; resumed at line N."` This makes error cascades legible.

---

## AST layer — A-01 to A-03

### A-01 🟠 Optional AST fields create invisible contracts

Several AST node types have optional fields that are only set in certain parse paths, creating implicit contracts that consumers must know:

- `FuncDeclNode.locals` — optional, but consumers branch on its presence throughout lowering
- `VarDeclNode.typeExpr` and `.initializer` — both optional, both read unconditionally in some paths
- `SectionAnchorNode.bound` — feels optional but is always set

When a field is optional in the type but required in practice, bugs are runtime panics rather than type errors.

**Fix:** Where a field is always set, make it non-optional in the type. Where a field is sometimes absent, use a discriminated union:

```typescript
type VarDecl =
  | { kind: 'typed';   typeExpr: TypeExpr; initializer?: Expr }
  | { kind: 'inferred'; initializer: Expr }
```

Consumers are then exhaustively checked by the compiler.

---

### A-02 🟡 Two initializer node kinds for one concept

`VarInitValue` and `VarInitAlias` (ast.ts lines 215–217) both represent "this variable is initialized" via different paths. The distinction is meaningful but the naming does not make it clear. Readers must cross-reference comments to understand the difference.

**Fix:** Rename to `VarInitImmediate` (value computed at parse time) and `VarInitStorage` (alias to a named allocation), or document the distinction prominently in both type definitions.

---

### A-03 🟡 Fixed op matcher tokens are untyped strings

`MatcherFixed` (ast.ts line 346) accepts `token: string` with no validation. A typo in a fixed token name (`"HR"` instead of `"HL"`) is not caught until lowering, and the error message at that point is confusing.

**Fix:** Define a `FixedMatcherToken` union type listing all valid register and condition-code names. `MatcherFixed.token` becomes `FixedMatcherToken`. Invalid tokens produce a type error at parse time, not a runtime diagnostic.

---

## Semantics / environment layer — S-01 to S-03

### S-01 🟠 Module visibility resolution split between two files with overlapping logic

`env.ts` (lines 22–38) defines `resolveVisibleConst`, `resolveVisibleEnum`, `resolveVisibleType` and delegates to local maps. `moduleVisibility.ts` (lines 22–48) implements the same three functions with additional module-qualification logic. There are now four resolution paths for the same conceptual operation, and it is not obvious which to call when.

**Fix:** Single `resolveSymbol(name, env, kind) -> Symbol | undefined` in `moduleVisibility.ts`. `env.ts` does not do visibility resolution — it owns the data, `moduleVisibility.ts` owns the lookup algorithm.

---

### S-02 🟡 Enum vs const vs type resolution have different lookup orders

`resolveVisibleEnum()` checks `env.enums.get(name)` (local first) before qualified lookup. `resolveVisibleConst()` does not follow the same order. This asymmetry means `Mode.Value` and `Value` silently have different resolution precedence depending on symbol kind.

**Fix:** Document a single precedence rule (e.g., local-first, then module-qualified) and enforce it uniformly across all three resolution functions. A shared `lookupWithPrecedence()` helper makes the rule visible in code.

---

### S-03 🟡 `CompileEnv` optional fields obscure phase readiness

`CompileEnv` (env.ts lines 45–49) has five optional fields (`moduleIds`, `importedModuleIds`, `visibleConsts`, `visibleEnums`, `visibleTypes`) that are only populated after a specific startup phase. Code after that phase reads them without null checks; code before that phase must not read them. The type does not encode this.

**Fix:** Split into `CoreCompileEnv` (always available) and `QualifiedCompileEnv extends CoreCompileEnv` (visibility fields, always non-optional). Pass the richer type only to functions that need it. This makes phase boundaries visible in function signatures.

---

## Lowering / codegen layer — L-01 to L-06

### L-01 🔴 Context object explosion — 31 context types, 20–60 fields each

This is the most serious structural problem in the codebase. Files like `ldLowering.ts`, `functionBodySetup.ts`, and `opExpansionOrchestration.ts` each define their own massive `Context` type (12–60 fields) and pass it through chains of 10–20 helper functions. Changing one helper's required data forces edits through the entire chain.

The root cause is the same as in most compiler codebases that start as "just pass context everywhere": context objects accumulate fields indefinitely because it is always easier to add a field than to think about ownership.

**Fix:** Introduce a capability-interface pattern:

```typescript
interface Emitter    { emit(instr: Instruction): void }
interface Diagnoser  { diag(msg: string, span: Span): void }
interface Resolver   { resolve(name: string): Symbol | undefined }
```

Low-level helpers declare only the capabilities they need. Higher-level orchestrators compose the capabilities. No function receives fields it does not use. The full context object exists only at the top-level entry point.

This is a multi-week refactor — but every new feature added before it makes it harder.

---

### L-02 🟠 Diagnostic helper functions redefined per lowering file

`diag()`, `diagAt()`, `diagAtWithId()`, and `diagAtWithSeverityAndId()` are reimplemented locally in `ldLowering.ts`, `sectionPlacement.ts`, `emissionCore.ts`, and others, despite `loweringDiagnostics.ts` existing for exactly this purpose. The local copies diverge in subtle ways (different default severities, different ID choices).

**Fix:** Delete all local diagnostic function definitions in lowering files. All lowering code imports from `loweringDiagnostics.ts`. Add a CI lint rule: `function diag\(` in `src/lowering/` is a build error.

---

### L-03 🟠 `ldLowering.ts` is a hybrid: neither table-driven nor purely semantic

At 897 lines, `ldLowering.ts` contains ad-hoc switches for different address modes mixed inline with addressing-pipeline construction. A comment at lines 9–11 acknowledges this: "keeps special-case routing in one place." But the file mixes encoding logic (which bytes to emit) with addressing logic (how to compute the address), which are conceptually distinct.

**Fix:** Separate `ldLowering.ts` into:
- `ldAddressing.ts` — address-mode selection and EA computation for `ld`
- `ldEncoding.ts` — byte-level encoding from a resolved `(dst, src, mode)` triple

The addressing file produces a typed `LdForm` discriminated union; the encoding file consumes it. This pattern already exists elsewhere in the encoding layer — `ld` should conform to it.

---

### L-04 🟠 Instruction encoding split across 7 files without a registry

`encode.ts`, `encodeLd.ts`, `encodeCoreOps.ts`, `encodeAlu.ts`, `encodeBitOps.ts`, `encodeControl.ts`, and `encodeIo.ts` each handle a subset of the instruction set via ad-hoc switches. Adding a new instruction requires knowing which file owns it, and the split between files is historical rather than principled.

**Fix:** Define an `InstructionEncoderRegistry`:

```typescript
const ENCODERS: Map<string, InstructionEncoder> = new Map([
  ['ld',  encodeLd],
  ['add', encodeAlu],
  // ...
]);
```

The main dispatcher is a single table lookup. The individual encoder files still exist but are now plug-in units, not ad-hoc fallthrough chains.

---

### L-05 🟠 Op matching involves 5+ context objects passed through 10+ helpers

`opMatching.ts` (377 lines) creates a 12-field `Context`, returns a helper factory, then passes it through `opExpansionOrchestration.ts` which wraps it in another context. The matching algorithm — which is central to ZAX's op overload resolution — is obscured by the plumbing.

**Fix:** Flatten to two functions with clear contracts:

```typescript
function selectOverload(
  overloads: OpDecl[],
  operands: Operand[],
  matchers: MatcherSet,
): OpDecl | AmbiguityError | null

function expandOp(
  decl: OpDecl,
  operands: Operand[],
  emit: Emitter,
  diag: Diagnoser,
): void
```

Selection is pure (no side effects, fully testable in isolation). Expansion has side effects (emit, diag) but is simple once selection is done.

---

### L-06 🟠 Section key format uses null-character separator without validation

`sectionKeys.ts` (line 53) encodes section keys as `${section}\u0000${name.toLowerCase()}`. There is no check that user-provided section or name strings don't contain null characters. A section named `"code\u0000evil"` silently collides with a section named `"code"` containing a subsection named `"evil"`. More importantly, the opaque encoding leaks into debug output.

**Fix:** Use a branded `SectionKey` opaque type with a safe separator (e.g., `:`), validated at creation:

```typescript
type SectionKey = string & { readonly __brand: 'SectionKey' }

function makeSectionKey(section: string, name: string): SectionKey {
  assert(!section.includes(':') && !name.includes(':'))
  return `${section}:${name.toLowerCase()}` as SectionKey
}
```

---

## Module / section system — M-01 to M-03

### M-01 🟠 `NamedSectionNode.anchor` is optional but the spec requires it

The v0.5 section model makes anchors mandatory — every named section must have a placement anchor. `sectionKeys.ts` (lines 147–159) reports missing anchors as runtime diagnostics. But `NamedSectionNode.anchor` is typed as `anchor?: SectionAnchorNode`, meaning the type system permits the invalid state.

**Fix:** Change `anchor?: SectionAnchorNode` to `anchor: SectionAnchorNode`. Update the parser to always produce an anchor node (possibly with a "synthetic" flag if the user omitted one) so the AST invariant holds by construction.

---

### M-02 🟡 Visibility and placement share module qualification logic without a shared abstraction

`moduleVisibility.ts` and `sectionPlacement.ts` both perform module-qualified name operations but define the qualification logic independently. A change to how modules are named (e.g., the root-relative path convention from `moduleIdentity.ts`) must be applied in both places.

**Fix:** Create a `moduleQualification.ts` module that owns the canonical rules for resolving a name against a module context. Both visibility and placement import from it.

---

### M-03 🟡 `sectionPlacement.ts` redefines `formatKey()` from `sectionKeys.ts`

`sectionPlacement.ts` line 59 defines a local `formatKey()` function that duplicates the one in `sectionKeys.ts`. This is the section-key equivalent of the diagnostic helper duplication in the lowering layer.

**Fix:** Delete the local copy. Import from `sectionKeys.ts`.

---

## General code health — G-01 to G-05

### G-01 🟡 Register codes hardcoded in multiple encoding files

`encode.ts` (lines 101–119) maps register names to integer codes (0–7). The same codes appear independently in `encodeLd.ts` and other files. If the mapping ever needs to change (e.g., to support an undocumented register variant), it must be found and changed in multiple places.

**Fix:** `Z80_REG_CODES: Readonly<Record<string, number>>` in `z80/registers.ts`, exported and imported everywhere. One source of truth.

---

### G-02 🟡 No structured debt markers; known compromises invisible to tooling

There are no `TODO`, `FIXME`, or `DEBT` comments in the codebase. This sounds like a good sign but is actually a warning: compromises exist (several are admitted in prose comments) but are not tagged in a way that `grep` or CI can surface. Future contributors cannot distinguish "this is intentional" from "this is a known problem we accepted."

**Fix:** Adopt a convention: `// DEBT(label): description` for known compromises, `// TODO(issue-N): description` for planned work. Run `grep -r 'DEBT\|TODO' src/` in CI to surface an inventory.

---

### G-03 🟡 Top-5 largest files are monoliths combining multiple concerns

| File | Lines | Problem |
| --- | --- | --- |
| `parser.ts` | 953 | Dispatch + error recovery + import management |
| `ldLowering.ts` | 897 | Addressing + encoding + EA resolution |
| `emit.ts` | 894 | Emission orchestration + format-specific output |
| `functionLowering.ts` | 776 | Frame setup + instruction lowering + epilogue |
| `encode.ts` | 684 | Dispatch + encoding for all instruction classes |

Files over ~400 lines are usually doing more than one thing.

**Fix:** Use the file-split suggestions in L-01, L-03, and L-04 above. As a rule, a file should be explainable in one sentence ("this file selects the ld address mode"). If it takes two sentences, it should be two files.

---

### G-04 🟡 Inconsistent diagnostic ID usage across lowering

Some lowering functions emit diagnostics with `DiagnosticIds.EmitError`; others use `DiagnosticIds.SemanticsError` in a lowering context; others call a wrapper that hardcodes an ID the caller cannot override. The result is that diagnostics look different depending on which path produced them.

**Fix:** Define a `LoweringDiagnosticId` subset type that only includes IDs valid in the lowering phase. The diagnostic wrapper accepts only this type. Phase-inappropriate IDs are type errors, not runtime surprises.

---

### G-05 🟡 TypeScript `any` escape hatches in operand and EA handling

Several operand-resolution and EA-materialization functions cast through `any` to bridge between different intermediate representations. Each cast is a hole in the type safety that `ldLowering.ts` and `opMatching.ts` rely on.

**Fix:** Replace `any` casts with explicit discriminated-union narrowing. Where that requires refactoring the intermediate representation, do it — the `any` cast is usually hiding a deeper design issue (two things being conflated that should be separate types).

---

## Synthesis: the underlying pattern

Almost every issue above is a symptom of the same root cause: **the codebase grew feature-by-feature without periodic structural consolidation.** Each new construct (op system, named sections, module visibility, startup init) added its own context types, its own diagnostic helpers, its own key encoding, and its own version of patterns that already existed elsewhere.

The result is not a parser and a lowering layer — it is fifteen partially-overlapping parsers and twenty-five partially-overlapping lowering fragments, connected by context objects that carry everything to everyone.

**The fix is not to rewrite.** It is to apply a consolidation pass to each layer in order:

### Recommended refactoring sequence

| Priority | Work | Effort | Impact |
| --- | --- | --- | --- |
| 1 | Centralise diagnostic helpers (L-02) | 1 day | Immediate; no risk |
| 2 | Collapse parser dispatch chains (P-01, P-03) | 3–4 days | Eliminates a class of grammar drift bugs |
| 3 | Fix optional AST fields (A-01) | 2–3 days | Type-safe by construction |
| 4 | Unify symbol resolution (S-01, S-02) | 2 days | One algorithm, three symbol kinds |
| 5 | Section key safety (L-06, M-03) | 1 day | Prevents silent collisions |
| 6 | Split `ldLowering.ts` (L-03) | 3–4 days | Makes encoding auditable |
| 7 | Instruction encoder registry (L-04) | 2–3 days | Principled extension point |
| 8 | Flatten op matching (L-05) | 3–4 days | Core algorithm visible and testable |
| 9 | Context capability interfaces (L-01) | 2–3 weeks | Eliminates the biggest structural risk |

Each step can be done independently. Each step makes the next step easier. The codebase does not need to stop adding features — but every feature added before step 1 makes step 9 harder.
