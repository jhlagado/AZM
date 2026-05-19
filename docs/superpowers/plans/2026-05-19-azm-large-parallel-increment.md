# AZM Large Parallel Increment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a substantial AZM alpha increment by implementing constant layout casts, tightening AZM-native deprecation boundaries, strengthening op/register-care integration, and adding external-corpus guardrails.

**Ordering:** See `docs/superpowers/plans/2026-05-19-azm-expression-first-increment.md` for the current expression-first implementation sequence (layout fold in semantics, not typed LD lowering).

**Architecture:** Keep the work split into independent surfaces. Layout-cast folding owns typed address expressions and constant fixups; AZM-native mode owns warnings and compatibility boundaries; op/register-care work owns analysis after inline expansion; corpus guardrails own scripts/docs and do not change compiler semantics.

**Tech Stack:** TypeScript, Vitest, Node CLI, AZM frontend/lowering, AZM register-care analyzer, ASM80-compatible fixture corpora.

---

## Context To Read First

- `docs/design/azm-language-direction.md`
- `docs/design/exact-size-layout-and-indexing.md`
- `docs/design/azm-ops-subset.md`
- `docs/audits/layout-constant-api-audit.md`
- `docs/audits/zax-feature-retirement-audit.md`
- `docs/audits/zax-test-retirement-map.md`
- `docs/spec/azm-assembly-baseline.md`
- `docs/reference/testing-verification-guide.md`
- Current branch: `codex/azm-next-feature-increment`

Current state:

- `offset(...)` is the preferred AZM spelling; legacy `offsetof(...)` remains accepted.
- `offset(Sprite[16], [2].flags)` is implemented.
- Runtime register indexes inside typed layout paths produce an explicit diagnostic.
- The next meaningful feature is constant-folding explicit layout casts like `<Sprite[16]>SPRITES[3].flags`.

## Parallel Workstreams

The following can run in parallel if file ownership is respected:

1. **Layout-cast folding:** parser/lowering/type resolution tests and implementation.
2. **AZM-native boundary:** deprecation warning tests and source-mode behavior only.
3. **Op/register-care integration:** register-care tests and documentation around op expansion.
4. **External corpus guardrails:** scripts/docs for read-only Pacmo/Tetro/MON3 validation.
5. **ZAX retirement map:** docs and test classification, no semantic changes.

Avoid concurrent edits to the same files. If two workers need a shared doc, the controller should integrate doc cross-links after workers finish.

---

## Task 1: Constant-Fold Layout-Cast Address Expressions

**Owner:** Worker A

**Files:**
- Modify: `src/lowering/eaResolution.ts`
- Modify if needed: `src/semantics/typeQueries.ts`
- Modify if needed: `src/frontend/parseOperands.ts`
- Test: `test/semantics/layout_cast_constants_azm.test.ts`
- Do not modify docs in this task.

**Purpose:** Make `<TypeExpr>base[index].field` usable as a compile-time address expression when every path index is constant.

- [ ] **Step 1: Write failing compile tests**

Create `test/semantics/layout_cast_constants_azm.test.ts` with tests covering:

```ts
it('folds a constant array layout cast into an immediate address', async () => {
  const result = await compileSource('zax', [
    'type Sprite',
    '  x: byte',
    '  y: byte',
    '  tile: byte',
    '  flags: byte',
    'end',
    '',
    'const BASE = 2',
    '',
    'export func main()',
    '  ld hl,<Sprite[16]>SPRITES[BASE + 1].flags',
    'end',
    '',
    'SPRITES:',
    '  .ds sizeof(Sprite[16])',
  ]);

  expectNoErrorDiagnostics(result);
  expectLdHlFixup(result, 'SPRITES', 15);
});
```

Also add:

```ts
it('folds a constant layout cast in memory operands', async () => {
  // ld a,(<Sprite[16]>SPRITES[3].flags) should emit an absolute load
  // with a fixup addend of 15.
});
```

and:

```ts
it('rejects runtime register indexes in layout-cast address expressions', async () => {
  // ld hl,<Sprite[16]>SPRITES[HL].flags should include "runtime index"
  // or "compile-time constant" in its error diagnostic.
});
```

- [ ] **Step 2: Run the new tests and verify failure**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/semantics/layout_cast_constants_azm.test.ts
```

Expected: constant folding tests fail because the layout-cast address is not yet lowered as a fixup with an addend.

- [ ] **Step 3: Implement constant path folding**

Add a helper in the lowering/type-resolution layer that:

1. Detects an `EaExprNode` containing an `EaReinterpret`.
2. Walks `.field` and `[index]` segments after the cast.
3. Evaluates only constant index expressions.
4. Computes the byte addend using exact `sizeOfTypeExpr(...)` and field offsets.
5. Returns `{ baseName, addend }` only when the base is a raw label/address name plus constant layout path.

Do not generate runtime multiply/add code. If any path index is a register or runtime expression, return a diagnostic.

- [ ] **Step 4: Wire the helper into LD absolute-address lowering**

Teach `ld hl,<Sprite[16]>SPRITES[3].flags` and `ld a,(<Sprite[16]>SPRITES[3].flags)` to use the existing absolute fixup machinery with the computed addend.

- [ ] **Step 5: Verify focused tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/semantics/layout_cast_constants_azm.test.ts test/semantics/layout_constants_azm.test.ts test/pr952_raw_ix_slot_offsets.test.ts test/pr781_ld_typed_storage_migration_diag.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lowering/eaResolution.ts src/semantics/typeQueries.ts src/frontend/parseOperands.ts test/semantics/layout_cast_constants_azm.test.ts
git commit -m "Fold constant AZM layout casts"
```

Omit unchanged files from `git add`.

---

## Task 2: AZM-Native Boundary Hardening

**Owner:** Worker B

**Files:**
- Modify: `src/frontend/azmDeprecations.ts`
- Modify if needed: source-mode detection in `src/frontend/*`
- Test: `test/frontend/azm_source_mode_deprecations.test.ts`
- Test: `test/frontend/azm_native_boundary.test.ts`
- Docs: `docs/audits/zax-feature-retirement-audit.md`

**Purpose:** Make `.azm` mode clearer: layout metadata is allowed, but inherited high-level ZAX behavior is warned precisely.

- [ ] **Step 1: Add boundary tests**

Create `test/frontend/azm_native_boundary.test.ts` with:

```ts
it('allows AZM layout metadata without deprecation warnings', async () => {
  // .azm source using type Sprite, sizeof(Sprite), offset(Sprite, flags)
  // should not produce AZM700 warnings.
});
```

```ts
it('warns for typed assignment in AZM-native source', async () => {
  // .azm source using ":=" should produce AZM700.
});
```

```ts
it('warns for structured control in AZM-native source outside ops', async () => {
  // .azm source using if/repeat/select should produce AZM700 where currently supported.
});
```

- [ ] **Step 2: Run tests and record failures**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/azm_source_mode_deprecations.test.ts test/frontend/azm_native_boundary.test.ts
```

Expected: new tests expose any missing or noisy AZM700 behavior.

- [ ] **Step 3: Tighten warning classification**

Update `azmDeprecations.ts` so:

- `type`, `union`, `sizeof`, `offset`, and constant-only layout casts are not warned as deprecated.
- `func`, typed assignment, typed storage blocks, typed externs, and structured compiler control remain warned in `.azm`.
- Warnings use `sizeof/offset` wording, not `sizeof/offsetof`.

- [ ] **Step 4: Update retirement audit**

In `docs/audits/zax-feature-retirement-audit.md`, change the layout keep list to `offset(...)` with a note that `offsetof(...)` is a legacy compatibility alias.

- [ ] **Step 5: Verify**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/azm_source_mode_deprecations.test.ts test/frontend/azm_native_boundary.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/azmDeprecations.ts test/frontend/azm_source_mode_deprecations.test.ts test/frontend/azm_native_boundary.test.ts docs/audits/zax-feature-retirement-audit.md
git commit -m "Harden AZM native source boundary"
```

---

## Task 3: Register-Care Analysis For Op Expansion

**Owner:** Worker C

**Files:**
- Inspect: `src/registerCare/*`
- Inspect: `src/lowering/opExpansionExecution.ts`
- Modify if needed: `src/registerCare/*`
- Test: `test/registerCare/opExpansion.integration.test.ts`
- Docs: `docs/design/azm-ops-subset.md`

**Purpose:** Prove that register-care sees the machine effects of expanded ops, not an artificial call boundary or opaque macro.

- [ ] **Step 1: Write integration tests**

Create `test/registerCare/opExpansion.integration.test.ts` with:

```ts
it('infers clobbers from instructions emitted by an op expansion', async () => {
  // op clear_a() expands to xor a
  // @Main calls/uses it inline
  // generated contract should clobber/output A and relevant flags according to current inference policy.
});
```

```ts
it('does not treat op invocation as a call boundary', async () => {
  // An op that expands to "ld b,a" should be seen as an inline register transfer,
  // not as an external routine with unknown clobbers.
});
```

- [ ] **Step 2: Run tests and verify failure or current behavior**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/registerCare/opExpansion.integration.test.ts test/lowering/pr510_op_expansion_execution_helpers.test.ts
```

Expected: either the new behavior already works and tests lock it, or failures identify the missing integration.

- [ ] **Step 3: Implement only if needed**

If register-care currently reads source before op expansion and cannot see expanded instructions, add the smallest integration hook needed to feed lowered/expanded instruction streams into analysis for `.azm`/AZM guardrail mode. If this is too large, document the exact blocker in the test file with `it.skip` and a clear TODO comment.

- [ ] **Step 4: Update ops doc**

In `docs/design/azm-ops-subset.md`, add a “Verified Guardrails” section explaining whether the current tests prove op effects are visible to register-care or whether the remaining blocker is explicitly skipped.

- [ ] **Step 5: Verify**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/registerCare test/lowering/pr510_op_expansion_execution_helpers.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/registerCare src/lowering/opExpansionExecution.ts test/registerCare/opExpansion.integration.test.ts docs/design/azm-ops-subset.md
git commit -m "Guard register care across op expansion"
```

Omit unchanged files from `git add`.

---

## Task 4: External Corpus Guardrail Command

**Owner:** Worker D

**Files:**
- Create: `scripts/dev/run-azm-corpus-guardrails.mjs`
- Modify: `package.json`
- Modify: `docs/reference/testing-verification-guide.md`
- Test if needed: `test/cli/*`

**Purpose:** Add one command that validates AZM against local Tetro, Pacmo, and MON3 corpora when those repos exist, without requiring them in CI.

- [ ] **Step 1: Inspect current script patterns**

Read:

```bash
sed -n '1,220p' scripts/dev/run-azm-alpha-guardrails.mjs
cat package.json
```

- [ ] **Step 2: Create corpus guardrail script**

Create `scripts/dev/run-azm-corpus-guardrails.mjs` that:

- detects `/Users/johnhardy/projects/tetro`
- detects `/Users/johnhardy/projects/pacmo`
- detects `/Users/johnhardy/projects/MON3` or `/Users/johnhardy/projects/mon3`
- skips missing corpora with a clear `SKIP` line
- runs the built CLI/register-care audit against known `.asm` entry points only if discoverable
- never edits corpus files
- exits nonzero if an available corpus check fails

The script should be conservative: if entry points cannot be identified confidently, print `SKIP <repo>: no known entry point configured` rather than guessing.

- [ ] **Step 3: Add package script**

Add:

```json
"test:azm:corpus": "node scripts/dev/run-azm-corpus-guardrails.mjs"
```

- [ ] **Step 4: Document use**

In `docs/reference/testing-verification-guide.md`, add a short “Local corpus guardrails” section explaining:

- it is optional and local-only
- it treats game repos read-only
- it is intended before PRs touching parser/register-care/layout

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
npm run test:azm:corpus
```

Expected: build passes; corpus command either runs checks or emits explicit SKIP lines for unavailable repos.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/dev/run-azm-corpus-guardrails.mjs docs/reference/testing-verification-guide.md
git commit -m "Add optional AZM corpus guardrails"
```

---

## Task 5: ZAX Retirement Quarantine Categories

**Owner:** Worker E

**Files:**
- Modify: `docs/audits/zax-test-retirement-map.md`
- Modify: `docs/audits/zax-feature-retirement-audit.md`
- Create: `docs/audits/azm-alpha-test-buckets.md`

**Purpose:** Turn the existing audit into a practical deletion/quarantine roadmap without deleting code yet.

- [ ] **Step 1: Inspect test surfaces**

Run:

```bash
rg -n "func |:=|section data|globals|extern func|sizeof|offset|offsetof|op " test src docs/audits
```

- [ ] **Step 2: Create alpha test bucket doc**

Create `docs/audits/azm-alpha-test-buckets.md` with these sections:

- `AZM Core Keep`
- `ASM80 Compatibility Keep`
- `Register-Care Keep`
- `Layout Constants Keep`
- `Ops Keep Under Guard`
- `ZAX Compatibility Quarantine`
- `Retirement Candidates After Alpha`

Each section must list concrete test filename patterns and a short rationale.

- [ ] **Step 3: Update existing audit docs**

Add links from:

- `docs/audits/zax-test-retirement-map.md`
- `docs/audits/zax-feature-retirement-audit.md`

to the new bucket doc.

- [ ] **Step 4: Verify docs**

Run:

```bash
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add docs/audits/azm-alpha-test-buckets.md docs/audits/zax-test-retirement-map.md docs/audits/zax-feature-retirement-audit.md
git commit -m "Define AZM alpha test buckets"
```

---

## Task 6: Layout Cast Documentation And Examples

**Owner:** Worker F

**Files:**
- Modify: `docs/design/exact-size-layout-and-indexing.md`
- Modify: `docs/spec/azm-assembly-baseline.md`
- Create: `examples/azm/layout-casts.azm` if examples directory pattern allows

**Purpose:** Give future users and syntax highlighters concrete examples of the final intended layout syntax.

- [ ] **Step 1: Inspect examples layout**

Run:

```bash
find examples -maxdepth 3 -type f | sort | sed -n '1,120p'
```

- [ ] **Step 2: Add or update examples**

Create an AZM example only if the examples tree already has a suitable place. The example should include:

```asm
type Sprite
    x:     byte
    y:     byte
    tile:  byte
    flags: byte
end

SPRITE_SIZE  .equ sizeof(Sprite)
SPRITE_FLAGS .equ offset(Sprite, flags)

SPRITES:
    .ds sizeof(Sprite[16])

@Main:
    ld hl,<Sprite[16]>SPRITES[3].flags
    ld a,(<Sprite[16]>SPRITES[3].flags)
    ret
```

- [ ] **Step 3: Update baseline/spec docs**

In `docs/spec/azm-assembly-baseline.md`, add a compact layout constants section:

- `sizeof(Type)`
- `offset(Type, path)`
- explicit `<TypeExpr>label[index].field`
- indexes are compile-time only
- `offsetof` is legacy compatibility spelling

- [ ] **Step 4: Verify docs/examples**

Run:

```bash
git diff --check
```

If the example can compile with current implementation, run it through the CLI. If it depends on Task 1, leave a note in the doc that this example is enabled by the layout-cast implementation slice.

- [ ] **Step 5: Commit**

```bash
git add docs/design/exact-size-layout-and-indexing.md docs/spec/azm-assembly-baseline.md examples/azm/layout-casts.azm
git commit -m "Document AZM layout cast examples"
```

Omit unchanged or nonexistent example paths from `git add`.

---

## Integration Plan

After workers finish:

1. Run `git log --oneline --decorate -12`.
2. Run `git status --short`.
3. Resolve any documentation wording overlaps manually.
4. Run focused suites:

```bash
node node_modules/vitest/vitest.mjs run test/semantics/layout_constants_azm.test.ts test/semantics/layout_cast_constants_azm.test.ts test/frontend/azm_source_mode_deprecations.test.ts test/frontend/azm_native_boundary.test.ts test/registerCare test/lowering/pr510_op_expansion_execution_helpers.test.ts
```

5. Run guardrails:

```bash
npm run test:azm:alpha
npm run test:azm:corpus
```

6. If parser/lowering changed, run full tests:

```bash
npm test
```

## Expected Delivered Value

This increment should leave AZM with:

- working constant layout casts, or a precisely tested blocker
- a clearer `.azm` native boundary
- explicit evidence for how ops interact with register-care
- optional local corpus validation for Tetro/Pacmo/MON3
- a concrete test-retirement bucket map for removing inherited ZAX parts
- user-facing layout-cast examples using `offset`

