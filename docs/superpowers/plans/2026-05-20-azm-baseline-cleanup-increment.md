# AZM Baseline Cleanup Increment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish a significant AZM baseline increment by making native AZM look like a strict assembler path, quarantining ZAX-only features, and preserving the verified ASM80/register-care/alias/ops/layout-constant surface.

**Architecture:** Native AZM is a flat source-file assembler with textual `.include` / `include`, directive aliases, register-care contracts, op expansion, and compile-time layout constants. ZAX compatibility remains in an explicit compatibility lane, but native `.azm` must stop depending on ZAX module/import/function concepts at its public boundaries. This increment separates those boundaries without attempting a full backend rewrite.

**Tech Stack:** TypeScript, Vitest, Node scripts, AZM frontend/lowering/register-care pipeline.

---

## Current Context

Read these files before editing:

- `docs/handover-one.md`
- `docs/code-quality-findings.md`
- `docs/audits/azm-removal-inventory.md`
- `docs/audits/zax-test-retirement-map.md`
- `docs/design/azm-language-direction.md`
- `docs/design/azm-expression-and-visibility.md`
- `docs/spec/azm-assembly-baseline.md`
- `docs/reference/testing-verification-guide.md`

There are currently uncommitted documentation clarifications in:

- `docs/audits/azm-removal-inventory.md`
- `docs/code-quality-findings.md`
- `docs/design/azm-expression-and-visibility.md`
- `docs/design/azm-language-direction.md`
- `docs/handover-one.md`

Preserve those edits. They clarify that native AZM does not use ZAX `import` modules; it uses ASM80-style textual includes.

## Non-Negotiable Scope

Keep native AZM:

- Flat `.azm` source files.
- `.asm` / `.z80` ASM80-compatible input paths.
- Register-care analysis, AZMDoc / `.azmi`, and annotation rewriting.
- Directive alias layer.
- Op system and visible op expansion before register-care.
- `type` / `union`, `sizeof`, `offset`, legacy `offsetof`, and constant layout-cast expressions such as `<Sprite[16]>SPRITES[3].pos.x`.

Quarantine or remove from native AZM:

- ZAX `import` modules.
- ZAX function syntax and hidden frame lowering.
- ZAX named sections as native syntax.
- ZAX typed vars/data/globals, formal arguments, local variables, and typed assignments.
- ZAX structured high-level control syntax.

Do not delete working `.zax` compatibility behavior unless the ZAX compatibility lane stays green and the deletion is explicitly part of the task.

## Parallel Workstreams

Run these as separate subagents where possible. Workers are not alone in the codebase: they must not revert edits made by other workers, and they must adjust their changes around concurrent work.

### Workstream A: Native AZM Import/Module Retirement

**Owner:** Worker A  
**Write scope:**

- `src/frontend/parseModuleItemDispatch.ts`
- `src/frontend/parseTopLevelSimple.ts`
- `src/frontend/azmNativeUnsupported.ts` if present, or the native unsupported diagnostic helper currently used by `parseModuleItemDispatch.ts`
- `src/moduleLoader.ts`
- `src/moduleLoaderIncludePaths.ts`
- Tests under `test/frontend/` and `test/`
- Docs in `docs/audits/azm-removal-inventory.md` and `docs/audits/zax-test-retirement-map.md`

**Objective:** Native `.azm` rejects `import` as ZAX-only syntax. `.zax` compatibility keeps import tests green. Textual `.include` / `include` remains supported for AZM and ASM80 inputs.

- [ ] Add a failing native `.azm` test that `import "lib.azm"` reports AZM700 or the current native-ZAX rejection diagnostic.
- [ ] Add or confirm a `.zax` compatibility test still accepts existing import behavior.
- [ ] Ensure `.azm` native parser paths do not treat `ImportNode` as valid native source.
- [ ] Keep `importTargets()` available only for compatibility loading. Rename comments/docstrings to say “ZAX import targets”, not generic modules.
- [ ] Run:

```bash
npm run test:azm:alpha
npm run test:zax:compat
```

Expected: both pass.

### Workstream B: Include-First Loader Boundary

**Owner:** Worker B  
**Write scope:**

- `src/moduleLoader.ts`
- `src/moduleLoaderIncludePaths.ts`
- `src/api-tooling.ts`
- Tests around include behavior and load-program behavior.
- `docs/codebase-tour.md`
- `docs/reference/source-overview.md`

**Objective:** Make the loader boundary communicate that native AZM loads source files and textual includes, not semantic modules. Keep the public API stable unless every caller is updated in the same branch.

- [ ] Add tests proving native `.azm` follows textual include semantics independent of child file extension.
- [ ] Add tests proving directive aliases apply inside native included files.
- [ ] Introduce narrowly named internal helpers such as `loadSourceFileWithTextIncludes()` or `expandTextIncludesForFile()` if useful.
- [ ] Keep exported names such as `loadProgram()` stable for API compatibility.
- [ ] Update docs that still describe native AZM as module/import based.
- [ ] Run:

```bash
npm run test:azm:alpha
node node_modules/vitest/vitest.mjs run test/moduleLoader*.test.ts test/*include*.test.ts
```

Expected: all pass.

### Workstream C: Native Parser Dispatch Thinning

**Owner:** Worker C  
**Write scope:**

- Create: `src/frontend/parseAzmNativeTopLevel.ts`
- Modify: `src/frontend/parseModuleItemDispatch.ts`
- Modify: `src/frontend/parseAzmClassicModuleLine.ts` only if needed
- Tests:
  - `test/frontend/azm_flat_module_asm.test.ts`
  - `test/frontend/azm_native_boundary.test.ts`
  - new focused parser tests if behavior is missing

**Objective:** Move native `.azm` top-level parsing into a dedicated helper that owns native flat labels, native directives, top-level asm items, and unsupported-ZAX diagnostics.

- [ ] Add a characterization test for the current native order: raw label, flat directive, top-level instruction, unsupported syntax diagnostic.
- [ ] Extract a helper with an interface shaped like:

```ts
export interface ParseAzmNativeTopLevelInput {
  file: string;
  line: string;
  lineNo: number;
  sourceMode: 'azm';
}
```

The exact fields may follow the existing parser context, but the helper must be AZM-native named and not generic “module item” code.

- [ ] Make `parseModuleItemDispatch.ts` delegate to this helper for native `.azm`.
- [ ] Keep `.asm` / `.z80` classic parsing separate.
- [ ] Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/azm_flat_module_asm.test.ts test/frontend/azm_native_boundary.test.ts
npm run test:azm:alpha
```

Expected: all pass.

### Workstream D: Native Assembler Emission Facade

**Owner:** Worker D  
**Write scope:**

- `src/lowering/nativeAsmLowering.ts`
- `src/lowering/functionLoweringPhases.ts`
- `src/lowering/programLoweringTraversal.ts`
- Create a small facade file if useful, for example `src/lowering/asmEmissionFrame.ts`
- Tests:
  - `test/frontend/azm_flat_module_asm.test.ts`
  - `test/semantics/layout_cast_constants_azm.test.ts`
  - relevant lowering tests

**Objective:** Stop making native AZM read as “a fake function” at the top-level emission boundary. It may still share backend helpers, but the native path should call assembler-named helpers.

- [ ] Add a characterization test that native flat `.azm` emits no function prologue, epilogue, frame, or hidden locals.
- [ ] Introduce an assembler-facing wrapper for instruction emission that accepts flat source items and backend context.
- [ ] Route `nativeAsmLowering.ts` through the assembler-facing wrapper.
- [ ] Leave deep backend reuse in place if removal would be risky; this increment is about the boundary.
- [ ] Update `docs/code-quality-findings.md` to mark the facade work complete or partially complete.
- [ ] Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/azm_flat_module_asm.test.ts test/semantics/layout_cast_constants_azm.test.ts
npm run test:azm:alpha
```

Expected: all pass.

### Workstream E: Shared Op Expansion Stream

**Owner:** Worker E  
**Write scope:**

- `src/lowering/opExpansionOrchestration.ts`
- `src/lowering/opExpansionExecution.ts`
- `src/lowering/opSubstitution.ts`
- `src/registerCare/programModel.ts`
- `test/registerCare/opExpansion.integration.test.ts`
- Add tests under `test/lowering/` if needed

**Objective:** Register-care and emission should consume the same visible op expansion model so the analyzer cannot drift from generated code.

- [ ] Add a regression test that compares the instructions seen by register-care after op expansion with the emitted lowered stream for a small op.
- [ ] Extract a shared expansion service only if it reduces duplication. Name it for visible assembler op expansion, not for ZAX.
- [ ] Keep cycle diagnostics and stack-policy behavior unchanged.
- [ ] Ensure register-care still runs after visible op expansion.
- [ ] Run:

```bash
node node_modules/vitest/vitest.mjs run test/registerCare/opExpansion.integration.test.ts test/lowering/*op*.test.ts
npm run test:azm:alpha
```

Expected: all pass.

### Workstream F: Neutral Directive Node Boundary

**Owner:** Worker F  
**Write scope:**

- `src/frontend/ast.ts`
- `src/frontend/asm80/parseClassicModule.ts`
- `src/frontend/parseAzmClassicModuleLine.ts`
- `src/lowering/classicDirectiveLowering.ts`
- `src/lowering/classicTraversalHelpers.ts`
- Tests for `.org`, `.equ`, `.db`, `.dw`, `.ds`, `.align`, `.binfrom`, `.binto`, `.end`

**Objective:** Start replacing misleading `Classic*` naming for native AZM flat directives with neutral assembler directive names. This may be an adapter layer first; do not force a risky full AST migration in one pass.

- [ ] Add tests proving native `.azm` directives and ASM80 `.asm` directives keep identical output where intended.
- [ ] Introduce neutral type aliases or wrapper constructors such as `AsmDataDirective`, `AsmEquDirective`, or `FlatDirective`.
- [ ] Update native `.azm` parser to produce neutral names where practical.
- [ ] Keep ASM80 compatibility behavior unchanged.
- [ ] If full migration becomes too invasive, stop after adding neutral constructors/adapters and document the remaining migration.
- [ ] Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/azm_flat_module_asm.test.ts test/frontend/pr576_unified_data_sections.test.ts test/frontend/pr785_raw_data_parser.test.ts
npm run test:azm:alpha
```

Expected: all pass.

### Workstream G: Docs, Test Lanes, And Retirement Map

**Owner:** Worker G  
**Write scope:**

- `docs/handover-one.md`
- `docs/code-quality-findings.md`
- `docs/audits/azm-removal-inventory.md`
- `docs/audits/zax-test-retirement-map.md`
- `docs/reference/testing-verification-guide.md`
- `test/migration-tracker.md`
- `scripts/dev/run-azm-alpha-guardrails.mjs`
- `scripts/dev/run-zax-compat-tests.mjs`

**Objective:** Keep the project map honest: native AZM tests in the alpha lane, ZAX-only tests quarantined in compatibility, and old docs no longer telling future agents to build modules/imports into AZM.

- [ ] Audit alpha guardrail contents. Native `.azm`, register-care, aliases, ops, includes, and layout constants belong there.
- [ ] Audit ZAX compatibility lane contents. ZAX imports/functions/sections/typed high-level syntax belong there until retired.
- [ ] Update the retirement map with every test moved or reclassified.
- [ ] Update handover docs with this increment’s new boundaries.
- [ ] Run:

```bash
npm run test:azm:alpha
npm run test:zax:compat
```

Expected: both pass.

## Integration Plan

The coordinator should do this work after subagents return.

- [ ] Review each worker diff for ownership violations.
- [ ] Resolve merge conflicts by preserving native AZM behavior and ZAX compatibility lane behavior.
- [ ] Run focused tests from each workstream.
- [ ] Run full local verification:

```bash
npm run test:azm:alpha
npm run test:zax:compat
npm run test:azm:corpus
npm test
git diff --check
```

Expected:

- AZM alpha passes.
- ZAX compatibility passes.
- Corpus guardrail passes or skips only documented missing local tools/repos.
- Full test suite passes.
- No whitespace errors.

- [ ] Ask a review subagent to review the integrated branch for:
  - native AZM accidentally depending on ZAX import/function concepts,
  - ZAX compatibility accidentally broken,
  - missing test-lane coverage,
  - misleading docs.
- [ ] Fix review findings.
- [ ] Create PR.
- [ ] Merge only after review has no findings and CI is green.

## Suggested Branch And Commit Shape

Branch:

```bash
git switch -c codex/azm-baseline-cleanup-increment
```

Suggested commits:

1. `docs: clarify native azm source-file baseline`
2. `test: pin azm native import rejection`
3. `refactor: separate native azm parser dispatch`
4. `refactor: add native assembler emission facade`
5. `refactor: share visible op expansion stream`
6. `refactor: introduce neutral flat directive boundary`
7. `docs: update azm cleanup retirement map`

## Risk Controls

- Do not remove `.zax` compatibility APIs just because native AZM no longer uses them.
- Do not move a ZAX-only test into alpha merely to keep it visible; alpha is for AZM.
- Do not change Pacmo or Tetro source as part of this increment. Use corpus comparison only.
- Do not weaken register-care diagnostics to make tests pass.
- Do not add new native syntax beyond the already agreed AZM baseline.

## Definition Of Done

- Native `.azm` rejects ZAX import/modules/functions/sections/high-level constructs at the boundary.
- Native `.azm` still supports flat assembly, textual includes, aliases, ops, register-care, and layout constants.
- Parser, loader, and emitter code names no longer imply native AZM is a fake ZAX module/function at their main boundaries.
- ZAX compatibility behavior remains testable in its lane.
- Docs identify remaining ZAX baggage and the next cleanup target.
- Verification commands have passed or documented unavoidable skips.
