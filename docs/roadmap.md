# AZM Roadmap

This file is for forward-looking implementation plans. It is separate from the
AZM Engineering Manual in `docs/codebase/`, which describes the current
codebase. When a roadmap item lands, move only durable implementation knowledge
into the engineering manual.

## Roadmap Item 1: File Imports and Public `@` Exports

### Goal

Add a module-like source composition mode for AZM where imported files compile
as part of the program but expose only their public `@` labels to other files.

The historical meaning of `@` is public-versus-private symbol intent. AZM also
uses `@` labels as register contract routine boundaries. This feature should
preserve both meanings:

- `@Routine:` is a public export of its source file.
- `@Routine:` is also a register contracts routine boundary.
- `Routine:` without `@` remains a private implementation label in imported
  files.

The end-state milestone is a fully worked out import feature with source
ownership, public/private visibility, diagnostics, register contracts behavior,
output metadata and documentation.

### First Syntax Decision

Use a new directive:

```asm
.import "module1.asm"
```

Do not overload `.include` in the first slice:

```asm
.include "module1.asm", module
```

Reason: `.include` already means textual inclusion. Import visibility is a
semantic boundary, so it deserves a visible directive. A second `.include`
parameter looks too small for the behavior change and would make examples harder
to scan.

Future namespace syntax can be designed later:

```asm
.import "module1.asm" as Module1
```

That is not part of the first release.

### Locked First-Release Decisions

These decisions are now fixed for the first implementation pass:

- `.import "file.asm"` is the only first-release import syntax.
- `.include` remains purely textual and compatibility-focused.
- private labels in imported files are hidden from code outside that imported
  file or import unit.
- private labels remain globally unique in the first release; local private
  label uniqueness is deferred.
- first-release privacy applies to labels only, not `.equ`, `.enum`, `.type`,
  type aliases, ops or directive aliases.
- entry/root source files keep current flat program behavior for non-`@`
  labels.

### Current Baseline

The current loader in `src/node/source-host.ts` expands `.include` textually and
recognizes first-slice `.import` directives. It reads the entry file, scans
logical lines and recursively replaces load directives with the loaded file's
logical lines. Logical lines carry:

```ts
sourceName;
line;
text;
sourceUnit?;
sourceRelation?;
```

`sourceName` remains the physical source path used for diagnostics and output
maps. `sourceUnit` identifies the owning import unit. `sourceRelation` records
whether a line came from the entry file, a textual include or an import.

The parser marks `@Name:` labels as:

```ts
{ kind: 'label', name: 'Name', isEntry: true, span }
```

Address planning currently builds one flat symbol table. Labels and equates are
globally visible and duplicate labels are rejected globally. Register contracts
use `isEntry` labels to discover public routine boundaries.

This baseline is useful and should not be disrupted. `.include` remains a flat
textual compatibility mechanism. `.import` now creates source ownership
metadata, but visibility enforcement is intentionally deferred to the next
phase.

### Phases 0-2 Status

Status: implemented.

Evidence:

- phase 0 design lock is recorded in "Locked First-Release Decisions" above.
- phase 1 source ownership metadata exists on `LogicalLine` and parser spans as
  optional `sourceUnit` and `sourceRelation` fields.
- phase 2 `.import "file.asm"` loading is implemented in
  `src/node/source-host.ts`.
- focused tests live in `test/integration/stage-11-tooling-api.test.ts`.

Verified behavior:

- `.import "module.asm"` loads module source at the import point.
- imported source can assemble with the root program.
- imported lines are marked `sourceRelation: 'import'` and owned by their
  imported file.
- `.include` inside an imported file remains textual and stays owned by the
  importing import unit.
- nested imports are supported.
- imports resolve relative to the importing file and then through include
  directories.
- missing imports report `AZMN_SOURCE` diagnostics that say `Failed to resolve
import`.
- recursive imports report `recursive import`.
- existing include behavior remains covered by the same tooling test file and
  PR950 include tests.

Still deferred:

- private-label visibility enforcement.
- register contracts import visibility refinements.
- D8/tooling public/private symbol metadata.
- namespaced imports.
- local private label uniqueness.

Cycle handling exists for the current loader stack. Recursive `.import` and
`.include` expansion is diagnosed as source recursion. Repeated imports of the
same resolved file are idempotent: the first import loads and emits the module,
and later imports of that resolved file are skipped. `.include` remains textual
and repeatable.

### Phase 2.5 Status: Repeated Import Idempotence

Status: implemented.

Evidence:

- `src/node/source-host.ts` tracks resolved import paths during expansion.
- repeated `.import` of an already-loaded resolved file is skipped.
- `.include` does not use the import set and remains textual.
- recursion detection still runs before import de-duplication.
- focused tests in `test/integration/stage-11-tooling-api.test.ts` prove:
  - repeated direct imports load once.
  - diamond imports load shared modules once.
  - repeated includes still expand repeatedly.
  - a file can be textually included and imported as distinct composition modes.
  - recursive imports still report `recursive import`.

### Non-Goals for the First Release

- No namespace aliasing.
- No `Module.Symbol` reference syntax.
- No re-export syntax.
- No package/library system.
- No duplicate private labels across imported files in the first slice.
- No automatic label rewriting in user-visible source.
- No change to `.include` behavior.
- No attempt to make all assembler symbols private by default outside import
  units.

### Final Feature Boundary

The fully worked out feature should support:

- `.import "file.asm"` source loading.
- imported files are compiled into the same output image.
- public `@` labels in an imported file are visible to the importing program.
- non-`@` labels in an imported file are private to that file or import unit.
- references inside an imported file can use that file's private labels.
- references outside an imported file cannot use that file's private labels.
- register contracts still analyze imported `@` routines as known internal
  routines.
- diagnostics explain visibility failures directly.
- output maps identify source files normally.
- `.include` remains purely textual.

The first release can retain global uniqueness for private labels while still
enforcing visibility. Later work can make private labels locally unique.

## Phased Delivery Plan

### Phase 0: Evidence and Design Lock

Purpose: verify the implementation impact of the locked first-release contract
before code changes.

Tasks:

- Audit the current source loader, parser, address planning, expression
  evaluation, fixup emission, D8 output and register contracts program model.
- Confirm implementation touch points for `.import "file.asm"` without adding
  any alternate syntax.
- Confirm imported files may themselves use `.include` and `.import`.
  `.include` remains textual within the current import unit; `.import` creates
  another import unit.
- Confirm entry-file non-`@` labels keep existing flat program behavior.
- Confirm imported-file private equates, enums, ops and layout types remain
  outside first-release privacy enforcement.
- Identify the smallest PR boundary for source ownership and `.import` loading
  before visibility enforcement.

Deliverables:

- Add a short implementation checklist if the work is split across multiple
  commits.
- Add focused first-slice test names before implementation begins.

Exit criteria:

- First-release behavior is narrow and testable.
- No ambiguity remains between `.include` and `.import`.

### Phase 1: Source Ownership Model

Purpose: represent import boundaries without changing assembler behavior yet.

Tasks:

- Extend logical source metadata to carry source ownership:
  - physical source file path
  - import unit id or root file path
  - source relation: entry, include, import
- Keep `sourceName` as the physical file path for diagnostics and output maps.
- Preserve current `.include` flattening semantics by assigning included lines
  to the including import unit.
- Add loader tests proving current `.include` source paths and line comments are
  unchanged.
- Add internal model tests for import-unit ownership once `.import` parsing
  exists.

Risks:

- Too much metadata on every line may leak into unrelated code.
- Output maps could accidentally switch from physical file paths to import unit
  ids.

Exit criteria:

- Existing include tests pass unchanged.
- New metadata is available where needed but no visibility rules are enforced
  yet.

### Phase 2: Parse `.import` as a Source Loader Directive

Purpose: load imported files into the compilation without visibility semantics.

Tasks:

- Add `.import "file.asm"` recognition in the source loader.
- Resolve import paths with the same search order as includes:
  - relative to importing source file
  - configured include directories
- Add recursion detection that reports whether the cycle involves include or
  import.
- Add diagnostics for missing import files.
- Preserve preloaded entry-file behavior for tooling.
- Decide whether `.import` is case-sensitive in native mode. Current directive
  handling has compatibility case behavior; this feature should follow the
  active directive policy at implementation time rather than introduce a one-off
  rule.

Tests:

- `.import "module.asm"` loads module source.
- missing import reports a source diagnostic with candidate paths.
- recursive import reports a source diagnostic.
- imported file may use `.include` for private text fragments.
- imported file may import another file.
- `.include` remains accepted and unchanged.

Exit criteria:

- Imported file bytes can be emitted in the correct order for simple programs.
- No private/public enforcement yet.

### Phase 3: Symbol Ownership and Public Export Table

Purpose: classify labels by owner and public/private visibility.

Status: implemented.

Evidence:

- label source ownership is collected from parser spans in
  `src/assembly/import-visibility.ts`.
- imported `@Label:` definitions are treated as public labels.
- imported non-`@` label definitions are treated as private to their
  `sourceUnit`.
- global duplicate detection remains in the existing address-symbol path.
- `.include` labels keep the including import unit's ownership because the
  loader assigns included lines to the including `sourceUnit`.
- included labels inside imported modules are private unless the label itself is
  an `@` entry label.

Tasks:

- Extend parsed label or symbol metadata with owner/import-unit information.
- Build an export table for imported files:
  - public labels are labels parsed from `@Name:`.
  - exported name is `Name`, matching current `@` normalization.
- Preserve global duplicate detection initially.
- Add explicit diagnostics for duplicate public exports and duplicate flat
  symbols.
- Keep `.include` labels in the including file's ownership scope.

Tests:

- `@Public:` in imported file is recorded as public export `Public`.
- `Private:` in imported file is recorded as private.
- included helper labels remain part of the including file's scope.
- duplicate private labels across files still fail in the first release if
  global uniqueness is retained.

Exit criteria:

- The compiler has enough ownership information to enforce visibility.
- Existing D8 symbols and diagnostics still use physical source locations.

### Phase 4: Visibility Enforcement for Label References

Purpose: make imported private labels inaccessible from outside their file.

Status: implemented.

Evidence:

- `assembleProgram()` runs import visibility validation before address planning
  and emission.
- `analyzeProgramNext()` now returns assembly diagnostics as well as case-style
  diagnostics.
- focused tests in `test/integration/stage-11-tooling-api.test.ts` prove:
  - external references to imported public `@` labels are accepted.
  - external references to imported private labels are rejected.
  - imported files may reference their own private labels.
  - labels from textual includes inside imported files stay private to that
    imported unit.
  - external data and equate references to imported private labels are
    rejected.
  - flat non-imported programs remain unchanged.
- `compile()` de-duplicates exact repeated diagnostics because tooling analysis
  and artifact emission can both run assembly.

Tasks:

- Identify all expression contexts that can reference labels:
  - instruction operands and fixups
  - `.equ`
  - data directives
  - layout expressions where label values are legal
  - `.binfrom` / `.binto`
- Add a visibility check before or during symbol resolution:
  - same import unit can reference private labels in that unit.
  - outside import unit can reference only exported `@` labels.
  - entry/root flat program behavior remains unchanged.
- Produce a direct diagnostic:

```text
symbol "PrivateHelper" is private to module.asm; export it with @PrivateHelper or keep the reference inside that file
```

- Ensure unresolved-symbol diagnostics do not mask visibility diagnostics.

Tests:

- root can `call PublicRoutine` from imported file.
- root cannot `call PrivateHelper` from imported file.
- imported file can `call PrivateHelper` internally.
- imported file can reference its own private label in data/fixup contexts.
- `.include` still allows the including file to reference included labels as
  before.
- visibility diagnostics include the reference location and defining file.

Exit criteria:

- Visibility behavior works for direct instruction calls and at least one data
  expression path.
- Existing global programs still compile unchanged.

### Phase 5: Register Contracts Integration

Purpose: keep imported public routines usable under `--rc strict`.

Status: implemented.

Evidence:

- `buildRegisterContractsProgramModel()` consumes the expanded source item list,
  so imported `@` routines are visible as internal routines.
- direct-call-target labels are promoted to routine boundaries in
  `src/register-contracts/programModel-routines.ts`, allowing private helpers
  inside imported modules to be summarized when called.
- `compile()` returns assembly analysis errors before running register
  contracts, so private-label visibility failures are not followed by unknown
  register-contract boundary noise.
- focused tests in `test/integration/register-contracts/integration.test.ts`
  prove:
  - imported public `@` routines are known internal routines under strict mode.
  - imported public routines can call private helpers under strict mode.
  - external calls to imported private labels report only visibility errors.
  - strict stack discipline is still enforced inside imported public routines.

Tasks:

- Ensure imported `@` routines appear as known internal routines in the register
  contracts program model.
- Ensure private helper routines in imported files are analyzable when called
  internally.
- Ensure root calls to imported private labels fail as visibility diagnostics,
  not unknown direct-call boundary diagnostics.
- Preserve `@` routine boundary handling.

Tests:

- root imports module and calls exported `@Routine`; `--rc strict` passes when
  contracts are sound.
- imported exported routine calls private helper; `--rc strict` sees both
  routines and passes when stack/register discipline is sound.
- root calls imported private helper; visibility error appears before register
  contract unknown-boundary noise.
- imported private helper with stack imbalance still fails strict when reachable
  through exported public routine.

Exit criteria:

- `.import` works with `--rc strict` for a small multi-file program.
- Strict mode remains sound for private helper stack/register errors.

### Phase 6: Output and Tooling Surface

Purpose: keep generated artifacts useful and stable.

Status: implemented for the first `.import` slice.

Implemented boundary:

- Native `.bin` and `.hex` output assemble imported source at the import point.
- `.d8.json` includes imported physical files in `fileList`, per-file symbols
  and source-attributed segments.
- ASM80-lowered `.z80` output rejects imported source units with an explicit
  `AZMN_ASM80` diagnostic instead of silently flattening module boundaries.
  This keeps compatibility output honest until a designed import-lowering policy
  exists.

Tasks:

- Confirm `.bin`, `.hex` and `.d8.json` output are unchanged for equivalent
  `.include` programs.
- Confirm `.d8.json` file entries include imported physical files.
- Decide whether D8 symbol metadata should expose public/private scope.
  Recommended first release: include current symbol metadata only unless Debug80
  needs visibility immediately.
- Confirm `loadProgram()` and tooling APIs expose enough diagnostics and source
  files for editors.
- Confirm ASM80-lowered `.z80` output behavior. Recommended first release:
  `.import` lowers as assembled source order only if ASM80 output can preserve
  behavior clearly; otherwise report an explicit unsupported ASM80-lowering
  diagnostic for `.import` until lowering policy is designed.

Tests:

- D8 map includes imported file paths and source segments.
  - `test/integration/stage-12-compile-api.test.ts` proves imported source
    emits native bytes, Intel HEX and D8 provenance for both root and imported
    physical files.
- ASM80 import lowering is explicit.
  - `test/integration/stage-12-compile-api.test.ts` proves `emitAsm80` reports
    `AZMN_ASM80` for `.import` source units and emits no incomplete lowered
    output.
- Tooling API loads imported files and reports diagnostics with correct files.
- Package smoke still passes.

Exit criteria:

- Existing consumers can handle imported sources without path regressions.
- Unsupported output combinations fail explicitly.

### Phase 7: Documentation and Release

Purpose: ship the first `.import` feature without confusing it with `.include`.

Status: implemented.

Release summary:

- `.import "file.asm"` is the first-release import syntax.
- `.include` remains textual and repeatable.
- imported source assembles at the import point.
- imported `@` labels are public exports visible outside the imported file.
- imported plain labels are private to their import unit.
- repeated imports of the same resolved file are idempotent.
- recursive include/import stacks are reported as source diagnostics.
- register contracts analyze imported public routines and their internal
  private helpers.
- D8 output records imported physical files and source segments.
- ASM80-lowered `.z80` output reports `AZMN_ASM80` for `.import` programs until
  a designed lowering policy exists.

Documentation evidence:

- `README.md` has a user-facing Imports section explaining `.include` versus
  `.import`, public `@` exports, imported private labels, repeated import
  idempotence, recursion diagnostics, register contracts behavior and the
  ASM80-lowered output limitation.
- `docs/codebase/02-source-loading-and-parsing.md` records source-loading,
  ownership, idempotence, recursion and imported-label visibility behavior.
- `docs/codebase/05-interfaces-and-output-artifacts.md` records tooling/D8
  provenance and the current ASM80 import limitation.
- `CHANGELOG.md` has an Unreleased release-note summary for the first `.import`
  slice.

Verification evidence:

- focused import/tooling/register-contract/CLI tests pass.
- `npm run lint`, `npm run typecheck`, `npm run check:source-file-sizes`,
  `npm run test:azm:alpha`, `npm run test:package` and `git diff --check`
  pass.

Tasks:

- Update README with a short `.include` versus `.import` section.
- Update `docs/codebase/02-source-loading-and-parsing.md` after implementation
  lands.
- Update `docs/codebase/appendices/b-compile-flow-reference.md` if the compile
  flow changes.
- Add changelog entry.
- Include examples:

```asm
; main.asm
.import "keyboard.asm"

@Start:
        call    ReadKey
        ret
```

```asm
; keyboard.asm
@ReadKey:
        call    ScanMatrix
        ret

ScanMatrix:
        xor     a
        ret
```

- Explain that `ReadKey` is public and `ScanMatrix` is private to
  `keyboard.asm`.

Release checks:

- focused source-loader tests
- focused symbol visibility tests
- register contracts integration tests
- CLI tests
- `npm run test:azm:alpha`
- `npm run test:package`

Exit criteria:

- Feature is documented as an import feature, not a textual include variant.
- Release note clearly states first-slice limits.

## Later Roadmap After First Release

### Local Private Label Uniqueness

Allow duplicate private labels in different imported files by internally
qualifying private labels with their import unit. This needs a careful resolver
change so output symbols, diagnostics and D8 maps remain readable.

### Namespaced Imports

Consider:

```asm
.import "keyboard.asm" as Keyboard
        call Keyboard.ReadKey
```

This should wait until the unqualified public-export model has real usage.

### Re-Exports

Consider a way for one module to re-export another module's public labels. Do
not design this until there is a real multi-module program that needs it.

### Privacy for Constants and Types

Consider whether `.equ`, `.enum`, `.type`, type aliases and ops should also
have import-unit privacy. This is a larger language decision because those
constructs are assembler-time facts, not address labels.

### Tooling Visibility Metadata

Expose public/private symbol metadata in D8 maps or tooling APIs if Debug80 can
use it for navigation, autocomplete or diagnostics.

## Open Questions

- Should root files be allowed to define private labels that are hidden from
  imported files, or should root remain flat for compatibility?
- Should `.import` be legal after `.end` for metadata-only import use? Initial
  recommendation: no.
- Should imported file order affect address placement exactly where `.import`
  appears? Initial recommendation: yes, imported code/data is assembled at the
  import point.
- Should an imported file without any `@` labels be legal? Initial
  recommendation: yes, but it exports nothing.
- Should `.import` participate in directive aliasing? Initial recommendation:
  no aliases for new native syntax unless compatibility later demands it.

## Definition of Done

The feature is complete when:

- `.import "file.asm"` is implemented and tested.
- `.include` compatibility is unchanged.
- public `@` labels from imported files are callable from outside.
- imported private labels are rejected from outside with direct diagnostics.
- imported private labels work inside their own file.
- register contracts strict mode works across imported public routines.
- output artifacts and tooling APIs keep correct source provenance.
- README, changelog and engineering manual are updated.
- package smoke and alpha guardrails pass.

## Roadmap Item 2: Parser and Grammar Quality Cleanup

### Goal

AZM is now mostly finished rather than in active feature construction. This
roadmap item is maintenance work: make the parser a clearer, more direct
implementation of the documented grammar without changing accepted AZM source
syntax.

The end-state milestone is:

- `docs/reference/azm-grammar.md` remains an accurate implementation reference.
- parser code is organised around shared grammar concepts instead of repeated
  local regular expressions.
- `src/core/compile.ts` coordinates parse phases but does not own low-level
  syntax details.
- chained instruction parsing has one implementation used by normal source and
  `op` bodies.
- compatibility behavior remains default behavior unless a future strict syntax
  profile is deliberately added.

### Baseline Assessment

The current parser is fundamentally sound. `parseNextSourceItems()` implements a
staged parse pipeline that matches the grammar reference:

1. source loading expands `.include` and `.import`.
2. conditional assembly filters inactive regions.
3. `op` declarations are collected.
4. layout declarations are parsed as whole blocks.
5. top-level `op` invocations are expanded.
6. chained instruction lines are split and parsed segment by segment.
7. remaining lines are parsed as labels, declarations, directives or Z80
   instructions.

That staged parser is the right architecture for AZM. A single monolithic parser
would make source loading, conditionals, `op` collection, layout blocks and Z80
operand parsing harder to reason about.

The quality issue is lower-level drift:

- `src/core/compile.ts` now knows too much about labels, chained-line segment
  rules, directive rejection and span construction.
- chained instruction parsing logic is duplicated between normal source parsing
  and `op` body parsing.
- label, identifier, entry-label and expression-symbol rules are spread across
  multiple files.
- directive/declaration recognition is repeated in source loading, conditional
  assembly, layout parsing, ordinary directive parsing, chained-line rejection
  and `op` parsing.
- `src/syntax/parse-directive-statement.ts` is still readable, but it is large
  enough that future directive changes should avoid adding more unrelated helper
  logic to it.

### Non-Goals

- Do not rewrite the parser from scratch.
- Do not replace the staged parser with a parser generator.
- Do not remove compatibility aliases or tolerated legacy forms in default AZM.
- Do not change Z80 instruction semantics.
- Do not change `.include`, `.import`, register contracts or output behavior.
- Do not make strict syntax the default.

### Work Item 2.1: Shared Syntax Primitives

Priority: P1.

Purpose: centralise the small grammar facts that are currently repeated.

Tasks:

- Add a shared syntax helper module, likely `src/syntax/names.ts`.
- Move name and label primitives into that module:
  - label-name validation.
  - identifier validation.
  - entry-label parsing.
  - `@` entry-label normalization.
  - leading-label parsing for `Label:` and `@Label:`.
- Replace local label/name regular expressions in parser and expansion code.
- Keep expression tokenization's narrower expression-symbol rule separate if it
  genuinely differs from label-name syntax, but document that difference in the
  helper or grammar reference.

Acceptance criteria:

- label/name parsing behavior is unchanged.
- focused parser tests for labels, entry labels, declaration names and expression
  symbols still pass.
- no duplicated `normalizeEntryLabelName` helper remains outside the shared
  syntax module.

### Work Item 2.2: Single Chained Instruction Parser

Priority: P1.

Purpose: ensure chained instruction syntax has one implementation.

Tasks:

- Extract chained instruction parsing out of `src/core/compile.ts`.
- Create a syntax-level parser, likely `src/syntax/parse-instruction-chain.ts`.
- Make it handle:
  - spaced-backslash splitting.
  - empty segment diagnostics.
  - labels only on the first segment.
  - directive/declaration rejection.
  - segment source columns and spans.
  - `op` invocation candidates.
- Reuse the same chain parser for:
  - top-level source lines.
  - `op` body template parsing.
- Keep `src/source/instruction-chain.ts` as the low-level splitter unless a
  better name emerges. It is useful as a quote-aware lexical helper.

Acceptance criteria:

- chained instruction tests still pass.
- chained lines inside `op` bodies behave exactly like chained lines in normal
  source, within the existing `op` template rules.
- `src/core/compile.ts` no longer contains label parsing or chained segment
  validation logic.

### Work Item 2.3: Shared Statement Classification

Priority: P1.

Purpose: avoid each parser phase inventing its own answer to "what kind of
statement is this?"

Tasks:

- Add a small syntax classifier for statement heads where useful.
- Centralise the logic that identifies directives/declarations that are illegal
  in chained instruction lines.
- Use the classifier from normal chained parsing and `op` body chained parsing.
- Keep source-loader directive recognition separate, because `.include` and
  `.import` are deliberately recognised before ordinary parsing.
- Keep conditional assembly recognition separate if that remains clearer, but
  ensure its directive spelling rules are documented and tested.

Acceptance criteria:

- rejected chained-line forms still produce clear diagnostics.
- directive and declaration recognition remains behaviorally unchanged.
- duplicate `isChainDirectiveOrDeclaration` style helpers are removed.

### Work Item 2.4: Directive Parser Decomposition

Priority: P2.

Purpose: prevent `parse-directive-statement.ts` from becoming the permanent home
for every directive detail.

Tasks:

- Keep the existing directive dispatch table if it remains readable.
- Move implementation helpers into narrower files only where this reduces
  complexity:
  - declarations: `.equ`, `.enum`, `.typealias`.
  - data/storage: `.db`, `.dw`, `.ds`.
  - string directives: `.cstr`, `.pstr`, `.istr`.
  - location/range directives: `.org`, `.align`, `.binfrom`, `.binto`, `.end`.
- Keep diagnostics text stable unless a clearer diagnostic is explicitly
  intended.

Acceptance criteria:

- directive parsing tests pass unchanged.
- each extracted file has a narrow responsibility.
- no new abstraction layer is added just for neatness.

### Work Item 2.5: Grammar Coverage Tests

Priority: P2.

Purpose: make the grammar reference executable enough to prevent drift.

Tasks:

- Add focused tests that mirror grammar sections rather than broad integration
  flows.
- Cover:
  - source-load directive isolation.
  - conditional assembly directive spelling.
  - label-only and label-statement lines.
  - optional colon compatibility for declarations.
  - chained instruction acceptance and rejection cases.
  - quoted byte versus string-fragment contexts.
  - layout headers and fields.
  - type expressions and compile-time functions.
- Prefer small parser/unit tests where possible, with integration tests only
  where phase ordering matters.

Acceptance criteria:

- each major grammar section has at least one direct test.
- grammar tests do not duplicate large fixture programs.
- failures identify the grammar rule that drifted.

### Work Item 2.6: Optional Strict Syntax Profile

Priority: P3.

Purpose: give future AZM a path to cleaner syntax without breaking compatibility
by default.

Tasks:

- Decide whether strict syntax belongs in the CLI, tooling API, or both.
- Define candidate strict warnings/errors:
  - directive aliases instead of native dotted directives.
  - optional colon on declarations.
  - old rejected enum/type forms.
  - compatibility quote behavior outside documented contexts.
  - any tolerated leading-dot label behavior if it remains accepted.
- Make strict syntax opt-in only.
- Keep this independent from register contract strictness.

Acceptance criteria:

- default AZM compatibility behavior is unchanged.
- strict syntax behavior is documented as style/language hygiene, not as a
  correctness requirement.
- Debug80 and other tooling can opt in deliberately if they want editor linting.

### Milestone Exit Criteria

This parser/grammar cleanup milestone is complete when:

- parser behavior is unchanged except for explicitly approved diagnostic wording.
- `docs/reference/azm-grammar.md` still matches implementation behavior.
- shared syntax primitives remove duplicated label/name parsing.
- chained instruction parsing is implemented once and reused.
- `src/core/compile.ts` reads as phase orchestration rather than low-level syntax
  parsing.
- directive parser responsibilities are either split or explicitly judged small
  enough to keep as-is.
- focused grammar coverage tests pass.
- `npm run lint`, `npm run typecheck`, `npm run check:source-file-sizes`,
  package smoke tests and relevant parser/integration tests pass.

### Suggested Delivery Shape

This should be delivered in small, reviewable PRs:

1. shared syntax primitives only.
2. shared chained instruction parser only.
3. shared statement classification only.
4. directive parser decomposition, if still worthwhile after the first three
   PRs.
5. grammar coverage tests and grammar reference refresh.

Avoid combining behavior-preserving parser cleanup with new AZM language
features.
