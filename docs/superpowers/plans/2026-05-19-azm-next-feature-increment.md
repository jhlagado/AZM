# AZM Next Feature Increment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AZM toward an alpha-quality assembler by tightening the public AZM surface, preserving assembly-first layout constants, validating the `op` extension path, and preparing controlled ZAX feature retirement.

**Architecture:** Keep AZM strict and assembly-first. Do not add broad parser tolerance or text macros; normalize compatibility through directive aliases, keep register-care/AZMDoc as tooling metadata, and retain only the layout/type machinery that computes constants without hidden runtime lowering.

**Tech Stack:** TypeScript, Vitest, Node CLI, Z80/ASM80 frontend and encoder, AZM register-care analyzer, AZMDoc comments, local optional ASM80/Tetro/Pacmo/MON3 corpora.

---

## Context To Read First

Every worker should read these before touching code:

- `docs/superpowers/plans/2026-05-18-azm-alpha-foundation.md`
- `docs/design/azm-language-direction.md`
- `docs/spec/azm-assembly-baseline.md`
- `docs/design/asm80-compatibility-baseline.md`
- `docs/design/exact-size-layout-and-indexing.md`
- `docs/design/azm-register-care-safety.md`
- `docs/spec/azmdoc.md`
- `docs/audits/zax-feature-retirement-audit.md`
- `docs/reference/testing-verification-guide.md`

Current state as of 2026-05-19:

- PR #6 landed as `53017f9`, adding `@Routine:` entry policy, compact generated `;!      ...` AZMDoc contracts, improved register-care output inference, and flag-safe generated `.azmi` interfaces.
- Tetro PR #39 landed compact AZM contracts in the game code.
- Source contract blocks intentionally omit scratch flag clobbers for readability; safety depends on local source being available for inference. Generated `.azmi` interfaces must include scratch flag clobbers because external callers do not have source bodies.
- Tetro/Pacmo are validation corpora. Treat them as read-only unless the user explicitly asks to edit the game repos.

## Parallel Workstreams

These workstreams can run in parallel because their primary write sets are disjoint:

1. **Naming and public surface inventory**: docs/package/CLI text, no parser changes.
2. **Layout constants spike**: semantic/layout expression code and tests.
3. **Ops survival smoke tests**: op parser/lowering tests and docs.
4. **Alpha guardrail command**: package scripts and test orchestration docs.
5. **ZAX retirement map**: audit docs and test classification, no code deletion.

Avoid parallel edits to the same files. In particular, only one worker should touch `package.json` at a time, and only one worker should touch parser/semantics files at a time.

---

## Task 1: Public AZM Naming Inventory And Low-Risk Renames

**Owner:** Worker A

**Files:**
- Modify: `docs/audits/zax-feature-retirement-audit.md`
- Modify: `docs/design/azm-language-direction.md`
- Modify: `docs/spec/azm-assembly-baseline.md`
- Modify if low-risk only: `src/cli.ts`
- Modify if low-risk only: `src/frontend/azmDeprecations.ts`
- Test: `test/cli/cli_contract_matrix.test.ts`
- Test: `test/frontend/azm_source_mode_deprecations.test.ts`

**Purpose:** Create a checked-in inventory of remaining user-visible `ZAX` naming and rename only clearly AZM-specific strings. Do not rename package name, binary name, diagnostic ID prefix, exports, or repository metadata in this task.

- [ ] **Step 1: Inventory current visible names**

Run:

```bash
rg -n "ZAX|zax|Zags|ZAX###|zax@" package.json README.md src test docs examples scripts
```

Expected: a broad list across package metadata, archived docs, tests, diagnostics, and compatibility language.

- [ ] **Step 2: Add an inventory section to the audit doc**

Append this section to `docs/audits/zax-feature-retirement-audit.md` and fill the table with concrete findings from Step 1:

```markdown
## Public naming inventory

Status: active inventory
Date: 2026-05-19

| Surface | Current spelling | AZM decision | Rationale |
|---------|------------------|--------------|-----------|
| npm package name | `@jhlagado/zax` | keep temporarily | Package split/rename is an alpha release decision. |
| CLI binary | `zax` | keep temporarily | Avoid breaking existing scripts before alpha packaging is decided. |
| diagnostic IDs | `ZAX###` | keep temporarily | Diagnostic ID migration needs a compatibility policy. |
| AZM-native deprecation message | `ZAX ... deprecated in AZM` | keep | The warning is explicitly about inherited ZAX constructs. |
| archive docs | `ZAX` | keep | Historical references should remain accurate. |
```

Add any additional rows that appear in the `rg` output.

- [ ] **Step 3: Rename only low-risk AZM-specific wording**

If CLI help or docs describe current register-care or AZMDoc features as ZAX-specific, update the wording to AZM. Do not change package metadata or executable names.

Example safe wording change:

```ts
// Before
'ZAX register-care report'

// After
'AZM register-care report'
```

Only make changes that are already covered by tests or obviously documentation-only.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/cli/cli_contract_matrix.test.ts test/frontend/azm_source_mode_deprecations.test.ts
```

Expected: all tests pass. If snapshots or exact strings fail, update only expectations that correspond to intentional wording changes.

- [ ] **Step 5: Commit**

```bash
git add docs/audits/zax-feature-retirement-audit.md docs/design/azm-language-direction.md docs/spec/azm-assembly-baseline.md src/cli.ts src/frontend/azmDeprecations.ts test/cli/cli_contract_matrix.test.ts test/frontend/azm_source_mode_deprecations.test.ts
git commit -m "Inventory AZM public naming surface"
```

If some files were not changed, omit them from `git add`.

---

## Task 2: Exact Layout Constant API Audit

**Owner:** Worker B

**Files:**
- Modify: `docs/design/exact-size-layout-and-indexing.md`
- Modify: `docs/audits/zax-feature-retirement-audit.md`
- Inspect: `src/semantics/layout.ts`
- Inspect: `src/semantics/type*.ts`
- Inspect: `src/frontend/*`
- Inspect: `test/pr8_sizeof.test.ts`
- Inspect: `test/pr1049_record_named_init_data_lowering.test.ts`
- Create: `docs/audits/layout-constant-api-audit.md`

**Purpose:** Produce the map needed before implementation of the layout-constant subset. This task is documentation/audit only; do not change parser or semantics yet.

- [ ] **Step 1: Find current layout APIs and tests**

Run:

```bash
rg -n "sizeof|offset|preRoundSize|storageSize|TypeExpr|Record|Union|Array" src test docs
```

Expected: current implementation and test locations for the inherited type/layout machinery.

- [ ] **Step 2: Create the audit document**

Create `docs/audits/layout-constant-api-audit.md` with this structure:

```markdown
# Layout Constant API Audit

Status: implementation prerequisite
Date: 2026-05-19

## Goal

Keep AZM's layout machinery only where it computes assembly-facing constants:
`sizeof`, `offset`, packed record/union sizes, array strides, and explicit
layout-cast address constants.

## Current implementation map

| Area | File(s) | Current behavior | AZM decision |
|------|---------|------------------|--------------|
| Type declarations |  |  | keep as layout metadata |
| Record layout |  |  | keep exact packed size |
| Union layout |  |  | keep max member size |
| Array type expressions |  |  | keep for size/stride constants |
| `sizeof` |  |  | keep exact byte count |
| `offset` |  |  | keep and extend for arrays/nested paths |
| typed assignment |  |  | deprecate/retire from AZM-native |
| hidden typed memory lowering |  |  | deprecate/retire from AZM-native |

## Existing tests to preserve

- `test/pr8_sizeof.test.ts`: [summarize]

## Gaps before implementation

1. [specific gap]

## Recommended first implementation slice

1. Lock exact-size tests for `sizeof(Sprite[16])`.
2. Lock `offset(Sprite, field)` and nested record paths.
3. Lock `offset(Sprite[16], [2].field)`.
4. Reject runtime register indexes inside layout-cast paths.
```

Fill every table cell with concrete findings.

- [ ] **Step 3: Cross-link the audit**

Add a short link from `docs/design/exact-size-layout-and-indexing.md`:

```markdown
The current implementation map is maintained in
`docs/audits/layout-constant-api-audit.md`.
```

Add a row or paragraph in `docs/audits/zax-feature-retirement-audit.md` noting that layout constant implementation is blocked on this audit.

- [ ] **Step 4: Verify docs only**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add docs/audits/layout-constant-api-audit.md docs/design/exact-size-layout-and-indexing.md docs/audits/zax-feature-retirement-audit.md
git commit -m "Audit layout constant implementation surface"
```

---

## Task 3: First Layout Constant Regression Tests

**Owner:** Worker C

**Files:**
- Modify: existing layout/sizeof/offset tests after Task 2 identifies exact files
- Likely modify: `test/pr8_sizeof.test.ts`
- Likely create: `test/semantics/layout_constants_azm.test.ts`

**Purpose:** Add failing or locking tests for AZM's accepted layout-constant subset before implementation work. This task may be started after Task 2 has identified the correct existing helpers.

- [ ] **Step 1: Locate compile helper patterns**

Run:

```bash
sed -n '1,220p' test/pr8_sizeof.test.ts
rg -n "offset\\(|sizeof\\(.*\\[|<.*>.*\\[" test src
```

Expected: identify how existing tests compile snippets and assert emitted bytes/diagnostics.

- [ ] **Step 2: Add exact `sizeof` tests**

Add tests equivalent to:

```ts
it('evaluates exact sizeof for arrays of records', async () => {
  const source = `
type Sprite
  x: byte
  y: byte
  tile: byte
  flags: byte
end

SIZE .equ sizeof(Sprite[16])
main:
  ld hl,SIZE
`;

  const result = await compileText(source);
  expect(result.diagnostics).toEqual([]);
  expect(/* emitted LD HL immediate */).toEqual(64);
});
```

Use the real test helpers and assertion style from Step 1; do not invent a new compile harness if one already exists.

- [ ] **Step 3: Add `offset` array path tests**

Add a test equivalent to:

```ts
it('evaluates offset for array element field paths', async () => {
  const source = `
type Sprite
  x: byte
  y: byte
  tile: byte
  flags: byte
end

OFFSET .equ offset(Sprite[16], [2].flags)
main:
  ld hl,OFFSET
`;

  const result = await compileText(source);
  expect(result.diagnostics).toEqual([]);
  expect(/* emitted LD HL immediate */).toEqual(11);
});
```

The expected value is `(2 * 4) + 3 = 11`.

- [ ] **Step 4: Add runtime-index rejection test**

Add a diagnostic test equivalent to:

```ts
it('rejects runtime registers in layout constant paths', async () => {
  const source = `
type Sprite
  x: byte
  y: byte
end

main:
  ld hl,<Sprite[16]>SPRITES[HL].x
SPRITES:
  .ds sizeof(Sprite[16])
`;

  const result = await compileText(source);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      severity: 'error',
      message: expect.stringContaining('runtime'),
    }),
  );
});
```

- [ ] **Step 5: Run tests and record current state**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/pr8_sizeof.test.ts test/semantics/layout_constants_azm.test.ts
```

Expected: tests may fail if implementation is incomplete. If they fail, commit them only if the next task is immediately implementing them on the same branch. If they pass, they are guardrails.

- [ ] **Step 6: Commit**

```bash
git add test/pr8_sizeof.test.ts test/semantics/layout_constants_azm.test.ts
git commit -m "Add AZM layout constant regression tests"
```

---

## Task 4: Ops Survival Smoke Test And AZM-Safe Subset Doc

**Owner:** Worker D

**Files:**
- Modify: `docs/design/azm-language-direction.md`
- Modify or create: `docs/design/azm-ops-subset.md`
- Inspect: `test/lowering/pr510_op_expansion_execution_helpers.test.ts`
- Inspect: `test/lowering/pr510_op_substitution_helpers.test.ts`
- Inspect: `src/frontend/*op*`
- Inspect: `src/lowering/*op*`
- Test: existing op tests

**Purpose:** Prove the inherited `op` system still has a place in AZM as AST-level assembly helpers, without reintroducing text macros.

- [ ] **Step 1: Inventory op implementation and tests**

Run:

```bash
rg -n "\\bop\\b|OpDecl|op expansion|substitution|op-stack" src test docs
```

Expected: list parser, AST, lowering, and test files that define current op behavior.

- [ ] **Step 2: Create AZM ops subset doc**

Create `docs/design/azm-ops-subset.md`:

```markdown
# AZM Ops Subset

Status: alpha direction
Date: 2026-05-19

## Purpose

AZM keeps `op` as an AST-level assembly extension mechanism, not as a text macro
system.

## Allowed in alpha

- parse operands as structured AST
- match operand shapes
- expand into ordinary Z80 assembly statements
- reuse small machine-visible instruction idioms
- participate in normal diagnostics and listings

## Not allowed in alpha

- arbitrary text substitution
- token concatenation
- generated symbol-name tricks
- hidden structured control flow
- implicit register preservation
- hidden stack-frame protocols

## Required smoke behavior

An AZM-safe op must compile to ordinary assembly that an experienced Z80
programmer could have written manually.

## Open questions

- Whether `op` declarations keep inherited ZAX syntax temporarily.
- Whether ops can declare register-care effects.
- Whether ops may interact with a future typed control stack.
```

- [ ] **Step 3: Add a focused smoke test or identify existing one**

If an existing op execution test already proves plain expansion into Z80, add comments or a test name making it AZM-relevant. If not, add a minimal test based on the existing harness:

```ts
it('expands a simple AZM-safe op into ordinary Z80 instructions', async () => {
  const source = `
op clear_a()
asm
  xor a
end

main:
  clear_a()
`;

  const result = await compileText(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.hex).toContain('AF');
});
```

Use the actual op syntax and test helpers from the current op tests.

- [ ] **Step 4: Run focused op tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/lowering/pr510_op_expansion_execution_helpers.test.ts test/lowering/pr510_op_substitution_helpers.test.ts test/pr271_op_stack_policy_alignment.test.ts
```

Expected: all pass.

- [ ] **Step 5: Link the doc**

Add a link in `docs/design/azm-language-direction.md` under "AST ops instead of text macros":

```markdown
The current alpha subset is captured in `docs/design/azm-ops-subset.md`.
```

- [ ] **Step 6: Commit**

```bash
git add docs/design/azm-ops-subset.md docs/design/azm-language-direction.md test/lowering/pr510_op_expansion_execution_helpers.test.ts test/lowering/pr510_op_substitution_helpers.test.ts
git commit -m "Document AZM-safe op subset"
```

Omit unchanged test files from `git add`.

---

## Task 5: Alpha Guardrail Command

**Owner:** Worker E

**Files:**
- Modify: `package.json`
- Modify: `docs/reference/testing-verification-guide.md`
- Modify: `docs/superpowers/plans/2026-05-18-azm-alpha-foundation.md`
- Possibly create: `scripts/dev/run-azm-alpha-guardrails.mjs`

**Purpose:** Add one contributor-friendly command for the non-private alpha checks. Optional local corpora remain separate.

- [ ] **Step 1: Inspect current scripts**

Run:

```bash
node -e "const p=require('./package.json'); console.log(p.scripts)"
ls scripts/dev
```

Expected: identify existing focused test scripts such as `test:asm80:baseline`, `test:asm80:tetro`, and regular `test`.

- [ ] **Step 2: Add a minimal alpha script**

Prefer a package script composed of existing commands:

```json
{
  "scripts": {
    "test:azm:alpha": "npm run build && vitest run test/registerCare test/frontend/directiveAliases.test.ts test/moduleLoader_asm80_include.test.ts test/asm80/asm80_directives_integration.test.ts test/asm80/asm80_equ_aliases.test.ts test/asm80/asm80_string_directives.test.ts test/asm80/asm80_align_directive.test.ts"
  }
}
```

If command length becomes awkward, create `scripts/dev/run-azm-alpha-guardrails.mjs`:

```js
#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['run', 'build']],
  [
    'npx',
    [
      'vitest',
      'run',
      'test/registerCare',
      'test/frontend/directiveAliases.test.ts',
      'test/moduleLoader_asm80_include.test.ts',
      'test/asm80/asm80_directives_integration.test.ts',
      'test/asm80/asm80_equ_aliases.test.ts',
      'test/asm80/asm80_string_directives.test.ts',
      'test/asm80/asm80_align_directive.test.ts',
    ],
  ],
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
```

Then set:

```json
{
  "scripts": {
    "test:azm:alpha": "node scripts/dev/run-azm-alpha-guardrails.mjs"
  }
}
```

- [ ] **Step 3: Document optional local corpora**

In `docs/reference/testing-verification-guide.md`, add:

```markdown
## AZM alpha guardrails

Run:

```bash
npm run test:azm:alpha
```

This command uses only repository-local tests. Optional corpus gates remain
separate because they require local source trees:

- `npm run test:asm80:baseline`
- `ZAX_RUN_TETRO_ACCEPTANCE=1 npm run test:asm80:tetro`
- MON3/TEC-1G checks when the relevant source paths are configured
```

- [ ] **Step 4: Run the command**

Run:

```bash
npm run test:azm:alpha
```

Expected: build plus selected tests pass on the local machine.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/dev/run-azm-alpha-guardrails.mjs docs/reference/testing-verification-guide.md docs/superpowers/plans/2026-05-18-azm-alpha-foundation.md
git commit -m "Add AZM alpha guardrail command"
```

Omit the script file if no script file was created.

---

## Task 6: Directive Alias Policy Tightening Tests

**Owner:** Worker F

**Files:**
- Modify: `test/frontend/directiveAliases.test.ts`
- Modify if needed: `src/frontend/directiveAliases.ts`
- Modify: `docs/spec/azm-assembly-baseline.md`

**Purpose:** Lock the directive alias boundary: aliases normalize directive heads only; they are not text macros, opcode aliases, or operand rewrites.

- [ ] **Step 1: Read current alias implementation and tests**

Run:

```bash
sed -n '1,260p' src/frontend/directiveAliases.ts
sed -n '1,220p' test/frontend/directiveAliases.test.ts
```

- [ ] **Step 2: Add rejection tests for macro-like aliases**

Add tests that assert aliases cannot target instructions or arbitrary text:

```ts
it('rejects directive aliases that target instructions', () => {
  expect(() =>
    loadDirectiveAliasesFromObject({
      directiveAliases: { BYTE: 'ld' },
    }),
  ).toThrow(/directive/i);
});

it('rejects directive aliases with operand text', () => {
  expect(() =>
    loadDirectiveAliasesFromObject({
      directiveAliases: { BYTE: '.db 0' },
    }),
  ).toThrow(/directive/i);
});
```

Use the actual loader helper names from the existing test file.

- [ ] **Step 3: Add a positive project alias test**

Add a test that maps a non-baseline spelling to a canonical data directive:

```ts
it('accepts project-local data directive aliases', () => {
  const aliases = loadDirectiveAliasesFromObject({
    directiveAliases: { FCB: '.db', FDB: '.dw', RMB: '.ds' },
  });

  expect(resolveDirectiveAlias(aliases, 'FCB')).toBe('.db');
  expect(resolveDirectiveAlias(aliases, 'FDB')).toBe('.dw');
  expect(resolveDirectiveAlias(aliases, 'RMB')).toBe('.ds');
});
```

Adapt helper names to the implementation.

- [ ] **Step 4: Update baseline docs**

In `docs/spec/azm-assembly-baseline.md`, add:

```markdown
Directive aliases normalize directive heads only. They must not rewrite
instructions, operands, labels, expressions, or arbitrary source text.
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/directiveAliases.test.ts test/moduleLoader_asm80_include.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/directiveAliases.ts test/frontend/directiveAliases.test.ts docs/spec/azm-assembly-baseline.md
git commit -m "Tighten directive alias policy tests"
```

Omit implementation file if unchanged.

---

## Task 7: ZAX Retirement Test Classification

**Owner:** Worker G

**Files:**
- Create: `docs/audits/zax-test-retirement-map.md`
- Modify: `docs/audits/zax-feature-retirement-audit.md`
- Inspect: `test/**/*.test.ts`

**Purpose:** Map tests that protect old ZAX language behavior versus tests that are still AZM foundation. Do not delete tests yet.

- [ ] **Step 1: Inventory high-level feature tests**

Run:

```bash
rg -n "\\bfunc\\b|:=|\\bwhile\\b|\\bif\\b|\\brepeat\\b|\\bdata\\b|\\bglobals\\b|\\bvar\\b|\\btype\\b|\\bunion\\b|\\bextern func\\b" test docs src
```

- [ ] **Step 2: Create the map**

Create `docs/audits/zax-test-retirement-map.md`:

```markdown
# ZAX Test Retirement Map

Status: audit, no deletion yet
Date: 2026-05-19

## Purpose

Classify tests inherited from ZAX so AZM can retire high-level behavior without
accidentally removing assembler foundation coverage.

## Categories

- **AZM foundation:** keep in normal CI.
- **AZM layout constants:** keep or adapt to exact layout-only semantics.
- **Ops:** keep if it validates AST-level op expansion.
- **ZAX compatibility:** preserve temporarily, but not part of AZM alpha.
- **Retirement candidate:** old high-level behavior with no AZM path.

## Test map

| Test file | Primary feature | Category | Notes |
|-----------|-----------------|----------|-------|
| `test/registerCare/...` | register-care | AZM foundation | keep |
| `test/asm80/...` | ASM80 compatibility | AZM foundation | keep |
```

Fill at least 30 concrete rows from the inventory.

- [ ] **Step 3: Update main retirement audit**

Add:

```markdown
The test classification lives in `docs/audits/zax-test-retirement-map.md`.
No test deletion should happen before that map is reviewed.
```

- [ ] **Step 4: Verify docs**

Run:

```bash
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add docs/audits/zax-test-retirement-map.md docs/audits/zax-feature-retirement-audit.md
git commit -m "Map inherited ZAX tests for retirement planning"
```

---

## Suggested Subagent Dispatch Plan

Start these immediately in parallel:

- Worker A: Task 1 public naming inventory.
- Worker B: Task 2 layout constant API audit.
- Worker D: Task 4 ops survival doc and smoke-test inventory.
- Worker E: Task 5 alpha guardrail command.
- Worker F: Task 6 directive alias policy tests.
- Worker G: Task 7 ZAX test classification.

Hold Task 3 until Task 2 reports the exact existing layout helpers and test harness. Task 3 touches semantic/layout tests and may conflict with any implementation work, so dispatch it after the audit comes back.

Controller responsibilities:

1. Create a fresh feature branch before dispatching workers.
2. Tell every worker: "You are not alone in the codebase. Do not revert edits by others. Keep your write set to the task files."
3. Give each worker only its task text and the context documents listed above.
4. When workers return, inspect `git diff --stat` and run focused tests for that task.
5. Resolve overlapping doc edits manually if needed.
6. Run final verification:

```bash
npm run build
npm run test:azm:alpha
node node_modules/vitest/vitest.mjs run test/registerCare test/frontend/directiveAliases.test.ts
git diff --check
```

7. Open a PR with a summary organized by workstream.

## Expected Outcome

After this increment, AZM should have:

- a public naming inventory with low-risk AZM wording cleaned up
- a layout constants implementation map
- first regression tests for exact layout constants queued or landed
- documented AZM-safe `op` subset
- a single alpha guardrail command
- directive alias boundary tests
- a ZAX test retirement map

This sets up the next code-heavy increment: implementing or trimming layout constants, then beginning carefully scoped ZAX high-level subsystem retirement.
