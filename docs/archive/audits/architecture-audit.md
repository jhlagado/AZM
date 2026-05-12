# ZAX Architecture Audit

> **Status**: Active. Issues are open until resolved; close each one with a link to the resolving PR.
> **Scope**: Full codebase — parser, AST, semantics, lowering, pipeline.
> **Goal**: Transform an accretion-driven codebase into one where the grammar drives the code, phases are explicit, and each concern lives in exactly one place.

---

## The Core Problem

The codebase has grown by successive addition rather than by reshaping. Each new feature was bolted on rather than integrated. The result is:

- The EBNF grammar exists as a document but does not drive the parser
- Every concern (diagnostics, export detection, type traversal, item dispatch) has two to six parallel implementations
- Phase boundaries (prescan → lower → place → finalise) are implicit in call order, not enforced by types
- The lowering layer threads a 68-field context object through every function

The following issues are ordered by the risk they pose if left unaddressed.

---

## Issue Index

| ID   | Area      | Title                                                                                              | Priority |
| ---- | --------- | -------------------------------------------------------------------------------------------------- | -------- |
| A-01 | Parser    | Item dispatch duplicated for module and section scope                                              | High     |
| A-02 | Parser    | `export` prefix detection scattered across every parse file                                        | High     |
| A-03 | AST       | `exported` field inconsistent: required in some nodes, optional in others                          | High     |
| A-04 | AST       | `SectionAnchorNode` permits invalid states (`size` + `end` simultaneously)                         | High     |
| A-05 | AST       | `returnRegs?: string[]` — `undefined` and `[]` both mean "no return"                               | High     |
| A-06 | Parser    | `diag()` helper re-implemented in every parse file (7 copies)                                      | Medium   |
| A-07 | Semantics | `env.ts` uses three different traversal patterns for the same item tree                            | Medium   |
| A-08 | Semantics | `resolveVisibleConst/Enum/Type` triple-duplicate the same access-check pattern                     | Medium   |
| A-09 | Lowering  | `FunctionLoweringContext` has 68 fields — emit, type, frame, clone concerns mixed                  | High     |
| A-10 | Lowering  | Phase boundaries (lower → place → finalise) implicit in call order, not types                      | High     |
| A-11 | Lowering  | `storageInfoForTypeExpr` and `offsetOfPathInTypeExpr` both implement type resolution independently | Medium   |
| A-12 | Pipeline  | `canonicalModuleId` uses basename only — collides for same filename in different directories       | High     |
| A-13 | Pipeline  | `buildEnv` makes four separate passes over `program.files` that could be one                       | Low      |

---

## A-01 — Item dispatch duplicated for module and section scope

**File**: `src/frontend/parser.ts`

`parseModuleFile` contains an inner function `parseSectionItems` (line 169) that handles item dispatch inside named sections. The outer module-level dispatch (line 558 onward) handles the same set of keywords — `func`, `const`, `type`, `op`, `extern`, `bin`, `hex`, `enum`, `union`, `globals`, `data` — with near-identical logic.

Any new item kind (or grammar change to an existing one) must be applied in both places. They have already begun to diverge: named section items do not support `import` or `section`; module items do not support the section anchor syntax. This is correct, but the divergence is enforced only by not copying those branches, not by a type-level constraint.

**Fix**: Extract a single `parseItem(context: ParseItemContext)` function where `ParseItemContext` describes what is permitted:

```typescript
type ParseItemContext = {
  allowImport: boolean;
  allowNamedSection: boolean;
  sectionKind?: 'code' | 'data';   ; undefined = module scope
};
```

Each keyword branch fires once. Unsupported keywords in a given context produce a diagnostic, not a missing `else` branch.

---

## A-02 — `export` prefix detection scattered across every parse file

**Files**: `parser.ts:190`, `parser.ts:558`, `parseData.ts`, `parseEnum.ts`, `parseTypes.ts`, `parseGlobals.ts`, `parseFunc.ts`, `parseTopLevelSimple.ts`

Every parse file that handles exportable declarations calls `consumeKeywordPrefix(text, 'export')` independently. There is no single place that owns "this token is an export modifier". If export syntax ever changes (e.g. to `pub`, or to `export(name)`), every file must be updated.

The grammar says `export` is a modifier prefix on declarations. The code should reflect this: detect the modifier once before dispatching to the declaration parser, pass it down as a boolean.

**Fix**: Handle `export` in the shared `parseItem` dispatcher (see A-01). Pass `exported: boolean` as a parameter into each declaration parser. Remove all `consumeKeywordPrefix(text, 'export')` calls from individual parse files.

---

## A-03 — `exported` field inconsistent across AST nodes

**File**: `src/frontend/ast.ts`

The `exported` field is required (`exported: boolean`) on `ConstDeclNode` (line 188), `FuncDeclNode` (line 293), and `OpDeclNode` (line 306). It is optional (`exported?: boolean`) on `TypeDeclNode` (line 158), `UnionDeclNode` (line 168), and `EnumDeclNode` (line 178).

Every consumer of `TypeDeclNode`, `UnionDeclNode`, or `EnumDeclNode` must decide whether `undefined` means unexported or uninitialised. There is no correct answer — both are in use.

**Fix**: Change all six to `exported: boolean`. Update the three optional-field nodes and every construction site. The parser sets the value from the modifier (see A-02); no call site should need to handle `undefined`.

---

## A-04 — `SectionAnchorNode` permits invalid states

**File**: `src/frontend/ast.ts`

```typescript
type SectionAnchorNode = {
  at: ImmExprNode;
  size?: ImmExprNode;   ; optional
  end?: ImmExprNode;    ; optional
};
```

The grammar says `size` and `end` are mutually exclusive — you can have one or neither, never both. The type system does not enforce this. A node with both `size` and `end` defined is representable and will not be caught until lowering (if at all).

**Fix**: Replace with a discriminated union:

```typescript
type AnchorBound =
  | { kind: 'none' }
  | { kind: 'size'; size: ImmExprNode }
  | { kind: 'end'; end: ImmExprNode };

type SectionAnchorNode = {
  at: ImmExprNode;
  bound: AnchorBound;
};
```

Every consumer switches on `bound.kind`. Invalid states become unrepresentable.

---

## A-05 — `returnRegs` ambiguity: `undefined` and `[]` both mean "no return"

**File**: `src/frontend/ast.ts`, `src/frontend/parseFunc.ts`

`FuncDeclNode.returnRegs` is typed `string[] | undefined`. Both `undefined` (field absent) and `[]` (empty array) are used to represent "this function has no register returns". The parse layer sets `returnRegs = []` explicitly when the return-register list is absent, but AST consumers must handle both states because nothing prevents the field from being absent.

**Fix**: Either make the field required (`returnRegs: string[]`, always `[]` for no-return functions) or model the distinction explicitly:

```typescript
type ReturnSpec =
  | { kind: 'registers'; regs: string[] }   ; func f(): A, HL
  | { kind: 'none' };                        ; func f(): void
```

The second form is only needed if the compiler distinguishes "no return registers declared" from "zero-length register list" for code-generation purposes. If it does not, make the field `returnRegs: string[]` (required, never `undefined`).

---

## A-06 — `diag()` helper re-implemented in every parse file

**Files**: `parser.ts`, `parseData.ts`, `parseFunc.ts`, `parseImm.ts`, `parseEnum.ts`, `parseTypes.ts`, `parseGlobals.ts`

Seven files each define a private `function diag(...)` that pushes a `ParseError` diagnostic with the same shape. The lowering subsystem already solved this with `src/lowering/loweringDiagnostics.ts`. The parse tier needs the same treatment.

**Fix**: Create `src/frontend/parseDiagnostics.ts` exporting `parseDiag`, `parseDiagAt`, and `parseDiagAtWithId`. Delete the seven private copies. All parse files import from `parseDiagnostics.ts`.

---

## A-07 — Three different traversal patterns for the same item tree

**File**: `src/semantics/env.ts`

`buildEnv` traverses `program.files` four separate times, using a different helper each time:

| Pass      | Helper                       | Concern                                      |
| --------- | ---------------------------- | -------------------------------------------- |
| Types     | `forEachDeclItem(items, cb)` | Recurses into `NamedSection`                 |
| Callables | `forEachDeclItem(items, cb)` | Same                                         |
| Enums     | `collectEnumMembers(items)`  | Returns array; does not use callback         |
| Imports   | `directImports(items)`       | Filter; does not recurse into `NamedSection` |

`collectEnumMembers` and `directImports` are parallel reimplementations of part of `forEachDeclItem`. Adding a new symbol kind requires choosing which pattern to copy and risking that the choice does not recurse into named sections when it should.

**Fix**: Define one visitor:

```typescript
type DeclVisitor = {
  onConst?: (node: ConstDeclNode, file: string) => void;
  onType?: (node: TypeDeclNode, file: string) => void;
  onEnum?: (node: EnumDeclNode, file: string) => void;
  onImport?: (node: ImportNode, file: string) => void;
  onFunc?: (node: FuncDeclNode, file: string) => void;
  onOp?: (node: OpDeclNode, file: string) => void;
};

function visitDecls(items: ModuleItemNode[], file: string, v: DeclVisitor): void;
```

One pass through `program.files`, one call to `visitDecls`, all concerns handled.

---

## A-08 — `resolveVisibleConst/Enum/Type` triple-duplicate the same pattern

**File**: `src/moduleVisibility.ts`

Three exported functions implement the same three-step pattern:

```
1. canAccessQualifiedName(name, file, env)
2. Extract qualifier with moduleQualifierOf(name)
3. Return from qualified map or local map
```

The only difference between them is which maps are consulted (`visibleConsts` vs `consts`, etc.).

**Fix**: Extract one generic resolver:

```typescript
function resolveVisible<T>(
  name: string,
  file: string,
  env: CompileEnv,
  qualifiedMap: Map<string, T> | undefined,
  localMap: Map<string, T>,
): T | undefined {
  if (!canAccessQualifiedName(name, file, env)) return undefined;
  const q = moduleQualifierOf(name);
  return q ? qualifiedMap?.get(name) : localMap.get(name);
}

export const resolveVisibleConst = (n, f, e) => resolveVisible(n, f, e, e.visibleConsts, e.consts);
export const resolveVisibleEnum = (n, f, e) => resolveVisible(n, f, e, e.visibleEnums, e.enums);
export const resolveVisibleType = (n, f, e) => resolveVisible(n, f, e, e.visibleTypes, e.types);
```

`resolveVisibleEnum` needs a minor addition: it must preserve the existing local-enum-member priority (`env.enums.get(name)` before qualified lookup), which can be expressed as a `localFirst` flag or pre-check.

---

## A-09 — `FunctionLoweringContext` has 68 fields

**File**: `src/lowering/functionLowering.ts`, lines 39–157

The context object passed to `lowerFunctionDecl` mixes four unrelated concerns:

| Concern         | Examples                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------- |
| Diagnostics     | `diag`, `diagAt`, `diagAtWithId`, `diagAtWithSeverityAndId`, `warnAt`                    |
| Emission        | `emitInstr`, `emitRawCodeBytes`, `emitAbs16Fixup`, `emitRel8Fixup`, `emitPendingSymbol`  |
| Type resolution | `resolveScalarKind`, `resolveEaTypeExpr`, `scalarKindOfResolution`, `storageTypes`       |
| Stack frame     | `stackSlotOffsets`, `stackSlotTypes`, `localAliasTargets`, `frameSize`, `bindSpTracking` |

`lowerFunctionDecl` immediately destructures the entire context into local variables (lines 159–195), which means the context boundary provides no encapsulation — it is simply a named tuple of 68 values passed as one argument instead of 68.

**Fix**: Three narrow context types, passed separately or composed:

```typescript
type EmitCtx = {
  emitByte(b: number): void;
  emitAbs16Fixup(name: string, addend: number): void;
  emitPendingSymbol(name: string): void;
  ; ... ~8 emit operations
};

type TypeCtx = {
  scalarKindOf(expr: TypeExprNode): ScalarKind;
  sizeOf(expr: TypeExprNode): number;
  resolveEaType(expr: EaExprNode): TypeExprNode | undefined;
  ; ... ~6 type operations
};

type FrameCtx = {
  slotOffset(name: string): number;
  slotType(name: string): TypeExprNode;
  frameSize(): number;
  ; ... ~5 frame queries
};
```

Each lowering function declares only what it needs. A function that emits load instructions needs `EmitCtx` and `TypeCtx` but not `FrameCtx`. Testing becomes straightforward — mock only the interface the function under test uses.

---

## A-10 — Phase boundaries are implicit in call order, not types

**Files**: `src/lowering/emit.ts`, `src/lowering/programLowering.ts`, `src/lowering/sectionPlacement.ts`, `src/lowering/startupInit.ts`

The compiler executes four logical phases:

1. **Prescan** — collect symbol names, named section keys, function signatures
2. **Lower** — emit bytes into contribution sinks, accumulate fixups
3. **Place** — assign addresses to named sections, run overflow/overlap checks, resolve fixups
4. **Finalise** — build startup init blob, assemble binary output

Currently these phases are enforced only by call order inside `compile.ts`. Any code in phase 2 can access phase-3 results (they are `undefined` at that point), and any code in phase 3 can read phase-1 data structures that have not been fully populated yet. Bugs in phase ordering produce incorrect output, not compiler errors.

**Fix**: Define typed hand-off structs between phases:

```typescript
type PrescanResult = {
  sectionKeys:       NonBankedSectionKeyCollection;
  moduleTraversal:   string[];
  ; ... other prescan outputs
};

type LoweredProgram = {
  sinks:             NamedSectionContributionSink[];
  legacyCodeBytes:   Map<number, number>;
  symbols:           Map<string, number>;   ; still unresolved
  fixups:            AbsoluteFixupRecord[];
};

type PlacedProgram = {
  regions:           PlacedNamedSectionRegion[];
  resolvedSymbols:   Map<string, number>;
  startupInit:       StartupInitRegion;
};
```

Each phase is a function `(input: PrevResult, options: CompilerOptions): NextResult`. Mutable state lives inside the phase function, not across the boundary. Phase ordering becomes impossible to violate.

---

## A-11 — `storageInfoForTypeExpr` and `offsetOfPathInTypeExpr` both implement type resolution

**File**: `src/semantics/layout.ts`

`storageInfoForTypeExpr` (line 68) and `offsetOfPathInTypeExpr` (line 173) both contain an inner `resolveType()` function that recursively resolves named type references. The two implementations are independent — a change to how recursive types are handled must be applied twice.

**Fix**: Extract a single `resolveNamedType(name: string, env: CompileEnv, visiting: Set<string>): TypeDeclNode | UnionDeclNode | undefined` function used by both. The two callers retain their own traversal logic but share the resolution primitive.

---

## A-12 — `canonicalModuleId` uses basename only

**File**: `src/moduleIdentity.ts`

```typescript
export function canonicalModuleId(modulePath: string): string {
  const normalized = modulePath.replace(/\\/g, '/');
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
```

`src/utils/math.zax` and `lib/math.zax` both produce the canonical ID `math`. The spec says "canonical resolved module path". The implementation uses basename.

For a project with more than one directory this produces incorrect duplicate-import suppression: two different modules are treated as the same module and only one's contributions are registered.

**Fix**: Use a path relative to the project root, normalised to forward slashes, without the extension:

```typescript
export function canonicalModuleId(modulePath: string, rootDir: string): string {
  const rel = path.relative(rootDir, modulePath).replace(/\\/g, '/');
  return rel.replace(/\.[^./]+$/, '');   ; strip extension only
}
```

`rootDir` is already available from `CompilerOptions.includeDirs[0]` or a dedicated `rootDir` option. This change must be propagated to every call site.

---

## A-13 — `buildEnv` makes four passes over `program.files`

**File**: `src/semantics/env.ts`

`buildEnv` iterates over `program.files` four separate times with separate loops collecting types, callables, enums, and import edges. This is a minor performance issue for large programs, but more importantly each loop uses a different traversal helper (see A-07), making it hard to reason about what is and is not collected on each pass.

**Fix**: After A-07 (single visitor), collapse to one pass per file per module:

```typescript
for (const mf of program.files) {
  visitDecls(mf.items, mf.path, {
    onType: (node) => {
      /* collect */
    },
    onEnum: (node) => {
      /* collect */
    },
    onConst: (node) => {
      /* collect */
    },
    onFunc: (node) => {
      /* collect */
    },
    onImport: (node) => {
      /* register edge */
    },
  });
}
```

---

## Recommended Work Order

Dependencies between issues constrain the order. Issues that unblock others come first.

### Tier 1 — Unblock everything else (do in this order)

1. **A-06** — `parseDiagnostics.ts`: zero dependencies, easy win, unblocks parser refactors
2. **A-03** — `exported: boolean` everywhere: AST change, propagates to all parse files
3. **A-05** — `returnRegs` disambiguation: AST change, small blast radius
4. **A-04** — `SectionAnchorNode` discriminated union: AST change, must update parser and lowering consumers

### Tier 2 — Grammar drives the parser

5. **A-02** — Centralise `export` prefix detection (depends on A-03)
6. **A-01** — Merge `parseSectionItems` and module-level dispatch (depends on A-02)

### Tier 3 — Semantics cleanup

7. **A-07** — Single `visitDecls` visitor (independent)
8. **A-08** — Generic `resolveVisible<T>` (depends on A-07 for context)
9. **A-11** — Extract shared `resolveNamedType` in `layout.ts` (independent)
10. **A-13** — Collapse `buildEnv` to one pass (depends on A-07)

### Tier 4 — Lowering restructure

11. **A-09** — Split `FunctionLoweringContext` into `EmitCtx`, `TypeCtx`, `FrameCtx`
12. **A-10** — Typed phase hand-off structs (can proceed alongside A-09)

### Tier 5 — Pipeline fix

13. **A-12** — Root-relative `canonicalModuleId` (independent but touches many call sites)

---

## What "Done" Looks Like

The refactor is complete when:

- Each EBNF grammar rule corresponds to exactly one parse function
- Every AST node type makes invalid states unrepresentable
- `parseDiagnostics.ts` is the only source of parse-tier diagnostic helpers
- `visitDecls` is the only traversal of `ModuleItemNode[]`
- `resolveVisible<T>` is the only qualified-name access guard
- `lowerFunctionDecl` accepts three narrow typed contexts, not one 68-field object
- Each compiler phase is a typed function from the previous phase's output type
- `canonicalModuleId` is root-relative and tested against cross-directory duplicates

---

## Codex Addendum (Second Audit Pass)

This section captures additional findings from an independent audit pass over current `main`. These are implementation issues not fully covered by A-01..A-13 and should be tracked in the same program.

| ID   | Area                | Title                                                                                           | Priority |
| ---- | ------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| C-01 | Semantics           | Import visibility graph derives from raw import text, not resolved path graph                   | High     |
| C-02 | Frontend + Lowering | Legacy section-directive path is still threaded through AST and lowering after hard-cut removal | High     |
| C-03 | Semantics           | Qualified visibility check fails open when import map is missing                                | Medium   |
| C-04 | Tooling             | Docs CI can fail on unrelated baseline formatting drift                                         | Medium   |
| C-05 | Lowering            | `emit.ts` is exactly at hard cap (1000), leaving no safety margin                               | Medium   |
| C-06 | Lowering            | Startup init runtime is raw-byte encoded with weak semantic scaffolding                         | Medium   |

### C-01 — Import visibility graph must be based on resolved modules

**Files**: `src/compile.ts`, `src/semantics/env.ts`, `src/moduleIdentity.ts`

`buildEnv` currently builds `importedModuleIds` from `ImportNode.specifier` text, not from the resolved module graph produced during compile loading. This can diverge from actual module resolution and produce wrong access decisions for qualified names.

**Fix**:

1. Emit an explicit resolved import edge map from `loadProgram` in `compile.ts`.
2. Build `importedModuleIds` in `env.ts` from that resolved graph.
3. Keep `canonicalModuleId` usage consistent with A-12 (root-relative module IDs).

### C-02 — Remove dead legacy section-directive path

**Files**: `src/frontend/ast.ts`, `src/frontend/parseTopLevelSimple.ts`, `src/lowering/programLowering.ts`, `src/lowering/emit.ts`

Legacy section directives are parser-rejected, but `SectionDirectiveNode` and lowering branches still exist. This keeps dead branches alive and increases ambiguity around the supported language surface.

**Fix**:

1. Remove `SectionDirectiveNode` from AST and parser return surface.
2. Delete legacy section handling branches in `programLowering.ts` and `emit.ts`.
3. Keep coverage only in explicit negative parser tests.

### C-03 — Fail closed on missing import map

**File**: `src/moduleVisibility.ts`

`canAccessQualifiedName` currently returns `true` when no import map exists for the file. This weakens visibility guarantees in precisely the state where information is incomplete.

**Fix**:

1. Change fallback to deny (`false`) for qualified names when `importedModuleIds` is missing.
2. Keep local same-module qualification allowed.
3. Add targeted tests proving no silent permissive fallback remains.

### C-04 — Stabilize docs CI baseline

**File**: `.github/workflows/ci.yml`

Docs-only PRs currently run global markdown format check and can fail on unrelated baseline drift.

**Fix**:

1. Run one-time repo-wide doc format normalization.
2. Keep strict docs check afterward.
3. Optionally gate docs-fast to changed docs paths only after baseline is clean.

### C-05 — Keep size cap margin, not just cap compliance

**Files**: `src/lowering/emit.ts` and file-size guard process

`emit.ts` is currently at exactly 1000 lines. This is technically compliant but operationally fragile.

**Fix**:

1. Extract one additional cohesive cluster from `emit.ts` to bring it under ~900.
2. Track hard cap and soft target in CI and review templates.

### C-06 — Startup init routine needs semantic representation

**File**: `src/lowering/startupInit.ts`

The startup routine is built as raw opcodes with manual label patching. It works, but it is expensive to review and easy to regress.

**Fix**:

1. Model startup routine as a typed pseudo-IR or mnemonic sequence.
2. Keep one encoder pass to bytes at the end.
3. Preserve exact output bytes with fixture lock tests.

---

## Team Execution Plan (3-Developer Split)

Primary throughput should go through **Developer A**. Developers B/C get narrow parallel slices with strict boundaries.

### Workstream Ownership

| Stream                                                                    | Owner       | Scope                                                                          |
| ------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| Parser/AST core cleanup (A-01..A-06 + C-02 parser surface)                | Developer A | `src/frontend/*`, AST and parser tests                                         |
| Semantics/pipeline graph correctness (A-07, A-08, A-12, A-13, C-01, C-03) | Developer B | `src/semantics/*`, `src/compile.ts`, `src/moduleIdentity.ts`, visibility tests |
| Lowering architecture cleanup (A-09, A-10, C-05, C-06)                    | Developer C | `src/lowering/*`, lowering/integration tests                                   |

### Required Sequence

1. **Developer A first (blocking)**:
   - A-06 -> A-03 -> A-05 -> A-04 -> A-02 -> A-01
   - plus parser/AST part of C-02
2. **Developer B starts after A-03/A-04 land**:
   - C-01 and C-03 first (correctness)
   - then A-12
   - then A-07/A-08/A-13
3. **Developer C starts after A-04 lands**:
   - A-09 first (context split)
   - then C-05 (bring `emit.ts` below safety margin)
   - then C-06
   - then A-10 (typed phase handoff)

### PR Boundaries (non-negotiable)

- One issue-sized change per PR.
- No mixed parser + lowering changes in one PR.
- No docs-only and code changes in one PR.
- Every PR includes:
  - explicit before/after invariants,
  - targeted tests,
  - `npm run typecheck`,
  - relevant focused test list.

### Merge and Coordination Rules

1. Merge blocking A-stream items in order.
2. B/C rebase only after each upstream dependency lands.
3. No one merges without explicit approval.
4. Close issue only when merged to `main`, not when PR opens.

---

## Suggested Ticketization Order

Create issues in this order to keep dependency flow explicit:

1. A-06
2. A-03
3. A-05
4. A-04
5. A-02
6. A-01
7. C-02
8. C-01
9. C-03
10. A-12
11. A-07
12. A-08
13. A-13
14. A-11
15. A-09
16. C-05
17. C-06
18. A-10
19. C-04
