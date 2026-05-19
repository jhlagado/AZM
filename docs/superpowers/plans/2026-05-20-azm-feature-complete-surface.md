# AZM Feature-Complete Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AZM from “native surface started” to a feature-complete assembler-shaped alpha: ASM80 baseline, register-care, directive aliases, ops, and compile-time layout constants, with ZAX high-level behavior isolated to compatibility tests.

**Architecture:** Keep `.azm` flat and assembler-first. Reuse backend emission where it emits instructions the programmer wrote or visible `op` expansions; reject ZAX-only syntax in `.azm`; keep layout typing only as constant-expression machinery. Split tests into AZM alpha guardrails and explicit `.zax` compatibility so later cleanup/deletion is low-risk.

**Tech Stack:** TypeScript, Vitest, Node CLI, ASM80-compatible Z80 frontend, AZM native parser/lowering, AZM register-care analyzer, AZMDoc contracts, local optional Tetro/Pacmo/MON3 corpora.

---

## Branch And Current State

Work on branch:

```bash
codex/azm-native-lowering-increment
```

Read this first:

- `docs/handover-one.md`
- `docs/audits/azm-removal-inventory.md`
- `docs/design/azm-expression-and-visibility.md`
- `docs/design/exact-size-layout-and-indexing.md`
- `docs/design/azm-ops-subset.md`
- `docs/spec/azm-assembly-baseline.md`
- `docs/audits/azm-alpha-test-buckets.md`
- `docs/audits/zax-test-retirement-map.md`
- `docs/reference/testing-verification-guide.md`

Important landed work:

- `.azm` flat module instruction lowering exists.
- `.azm` `org` + data placement exists.
- `.azm` rejects `func` and named `section`.
- Layout-cast constants fold at compile time.
- `offset(...)` is preferred; `offsetof(...)` remains a legacy alias.
- `npm run test:azm:alpha` passes at the handover point.

Important product boundary:

- Keep: ASM80-style source, register-care, directive aliases, AST `op`, layout constants.
- Remove from `.azm`: `func`, formal args, locals, `section` blocks, `:=`, structured control, typed storage, typed externs, runtime typed EA lowering.
- `.zax` compatibility can remain temporarily, but default AZM testing must stop depending on it.

## Parallel Workstream Map

Run these in parallel with disjoint file ownership:

1. **Worker A: Native Surface Completion** — parser/frontend tests for strict flat `.azm`.
2. **Worker B: Register-Care After Op Expansion** — make register-care analyze visible op-expanded instructions.
3. **Worker C: Test Lane Quarantine** — create explicit `test:zax:compat` lane and keep AZM alpha lean.
4. **Worker D: Corpus Guardrail Repair** — make Tetro/Pacmo/MON3 guardrails actually useful and read-only.
5. **Worker E: First ZAX Deletion Prep** — identify and remove/quarantine only safe default-test dependencies, no compiler deletion yet.
6. **Worker F: Docs/Handover Refresh** — update canonical docs after A-E.

Controller should reserve integration files:

- `docs/handover-one.md`
- this plan file
- final package script conflict resolution if Workers C/D both touch `package.json`

---

## Task 1: Native AZM Surface Completion

**Owner:** Worker A

**Files:**

- Modify: `test/frontend/azm_flat_module_asm.test.ts`
- Modify: `test/frontend/azm_native_boundary.test.ts`
- Modify if needed: `src/frontend/azmDeprecations.ts`
- Modify if needed: `src/frontend/parseAzmAsmStream.ts`
- Modify if needed: `src/frontend/parseAzmClassicModuleLine.ts`
- Modify if needed: `src/frontend/parseModuleItemDispatch.ts`

**Purpose:** Lock `.azm` as a strict flat assembler surface. Anything ZAX-high-level must be an error, while layout metadata, `op`, labels, instructions, `.equ`, `.db`, `.dw`, `.ds`, `.org`, includes, and aliases remain accepted.

- [ ] **Step 1: Add rejection tests for remaining ZAX syntax**

Add table-driven tests to `test/frontend/azm_native_boundary.test.ts`:

```ts
const rejectedAzmSources = [
  {
    name: 'typed assignment',
    source: ['main:', '  A := count', '  ret', 'count: .db 1', ''].join('\n'),
    message: 'Typed assignment is not supported in AZM-native source',
  },
  {
    name: 'structured if',
    source: ['main:', '  if z', '    ret', '  end', ''].join('\n'),
    message: 'Structured control is not supported in AZM-native source',
  },
  {
    name: 'typed data block',
    source: ['data sprites: byte[4]', 'end', ''].join('\n'),
    message: 'Typed data blocks are not supported in AZM-native source',
  },
  {
    name: 'typed globals block',
    source: ['globals', '  count: byte', 'end', ''].join('\n'),
    message: 'Typed storage blocks are not supported in AZM-native source',
  },
  {
    name: 'typed extern func',
    source: ['extern func PrintChar(a: byte)', 'end', ''].join('\n'),
    message: 'Typed extern declarations are not supported in AZM-native source',
  },
];
```

Assert each produces an error diagnostic containing the expected message.

- [ ] **Step 2: Add positive flat-source tests**

Add tests in `test/frontend/azm_flat_module_asm.test.ts`:

```ts
it('assembles dot-prefixed and bare flat data directives after org', async () => {
  const source = [
    'org $8000',
    'TableA:',
    '  .db 1,2,3',
    'TableB:',
    '  dw $1234',
    'Space:',
    '  ds 4',
    '',
    'org $4000',
    'main:',
    '  ld hl,TableA',
    '  ret',
    '',
  ].join('\n');
});
```

Also test `.equ` and directive aliases if the alias loader already supports a temporary alias file.

- [ ] **Step 3: Verify failures**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/azm_native_boundary.test.ts test/frontend/azm_flat_module_asm.test.ts
```

Expected: any missing rejection or flat directive behavior fails.

- [ ] **Step 4: Implement minimal parser/diagnostic fixes**

Make only the parser/frontend changes needed:

- `.azm` high-level constructs must produce `severity: 'error'`.
- Unsupported `.azm` lines must not be silently dropped.
- Layout metadata (`type`, `union`, `sizeof`, `offset`, layout casts) must not be rejected.
- Do not route `.azm` back through `func` or section lowering.

- [ ] **Step 5: Verify focused and alpha suites**

Run:

```bash
node node_modules/vitest/vitest.mjs run test/frontend/azm_native_boundary.test.ts test/frontend/azm_flat_module_asm.test.ts test/frontend/azm_source_mode_deprecations.test.ts
npm run test:azm:alpha
```

- [ ] **Step 6: Commit**

```bash
git add test/frontend/azm_flat_module_asm.test.ts test/frontend/azm_native_boundary.test.ts src/frontend/azmDeprecations.ts src/frontend/parseAzmAsmStream.ts src/frontend/parseAzmClassicModuleLine.ts src/frontend/parseModuleItemDispatch.ts
git commit -m "Complete native AZM surface guardrails"
```

Omit unchanged files.

---

## Task 2: Register-Care Truth After Op Expansion

**Owner:** Worker B

**Files:**

- Modify: `test/registerCare/opExpansion.integration.test.ts`
- Modify: `src/registerCare/programModel.ts`
- Modify if needed: `src/registerCare/tooling.ts`
- Modify if needed: `src/registerCare/analyze.ts`
- Inspect: `src/lowering/opExpansionExecution.ts`
- Inspect: `src/lowering/loweredAsmStreamRecording.ts`
- Modify: `docs/design/azm-ops-subset.md`

**Purpose:** Register-care should report the effects of visible `op` expansions. A routine containing `clear_a` must be analyzed as if it contains `xor a`, not as an unknown instruction head and not as a call boundary.

- [ ] **Step 1: Flip the known-current test to the desired behavior**

In `test/registerCare/opExpansion.integration.test.ts`, change:

```ts
expect(summary.mayWrite).not.toContain('A');
```

to:

```ts
expect(summary.mayWrite).toContain('A');
expect(summary.mayWrite).toContain('zero');
expect(summary.mayWrite).toContain('sign');
```

Use the exact current flag names from `test/registerCare/effects.test.ts`.

- [ ] **Step 2: Add a register-transfer op test**

Add:

```ts
it('infers inline register transfer effects from expanded ops', async () => {
  const source = [
    'op copy_a_to_b()',
    '  ld b,a',
    'end',
    '',
    'main:',
    '  ld a,7',
    '  copy_a_to_b',
    '  ret',
    '',
  ].join('\n');
});
```

Assert summary writes `A` and `B` according to current inference policy and contains no synthetic call.

- [ ] **Step 3: Run failing test**

```bash
node node_modules/vitest/vitest.mjs run test/registerCare/opExpansion.integration.test.ts
```

Expected: current source-based analysis fails the desired op-expanded effect assertion.

- [ ] **Step 4: Implement post-expansion analysis path**

Preferred implementation:

- Build/register-care program model from a post-op-expansion instruction stream for `.azm`.
- Reuse existing op expansion machinery, but do not emit bytes just to analyze.
- Preserve routine boundaries from flat labels.
- Keep expanded instructions source-attributed enough for diagnostics.

Acceptable interim if full stream reuse is too large:

- Add a small expansion adapter used only by register-care for op invocations.
- Expand only ordinary op bodies into `AsmInstructionNode[]`.
- Leave a clear code comment that this is the register-care visible-expansion path, not hidden lowering.

- [ ] **Step 5: Update ops doc**

In `docs/design/azm-ops-subset.md`, add:

```markdown
## Verified Guardrail: Register-Care Sees Expanded Ops

Register-care analyzes visible op expansions. An invocation such as `clear_a`
is treated as the emitted `xor a` instruction for register and flag effects.
Ops do not create call boundaries or callee contracts.
```

- [ ] **Step 6: Verify**

```bash
node node_modules/vitest/vitest.mjs run test/registerCare/opExpansion.integration.test.ts test/registerCare test/lowering/pr510_op_expansion_execution_helpers.test.ts
npm run test:azm:alpha
```

- [ ] **Step 7: Commit**

```bash
git add test/registerCare/opExpansion.integration.test.ts src/registerCare src/lowering/opExpansionExecution.ts src/lowering/loweredAsmStreamRecording.ts docs/design/azm-ops-subset.md
git commit -m "Analyze register care after op expansion"
```

Omit unchanged files.

---

## Task 3: Explicit ZAX Compatibility Test Lane

**Owner:** Worker C

**Files:**

- Modify: `package.json`
- Create: `scripts/dev/run-zax-compat-tests.mjs`
- Modify: `scripts/dev/run-azm-alpha-guardrails.mjs`
- Modify: `docs/audits/azm-alpha-test-buckets.md`
- Modify: `docs/audits/zax-test-retirement-map.md`
- Modify: `docs/reference/testing-verification-guide.md`

**Purpose:** Default AZM guardrails should represent the future assembler. Old `.zax` high-level tests must move into an explicit compatibility lane before code deletion begins.

- [ ] **Step 1: Create compatibility runner**

Create `scripts/dev/run-zax-compat-tests.mjs`:

```js
#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const tests = [
  'test/pr770_typed_reinterpretation_integration.test.ts',
  'test/pr781_ld_typed_storage_migration_diag.test.ts',
  'test/pr863_assignment_lowering.test.ts',
  'test/pr869_assignment_reg8_integration.test.ts',
  'test/pr875_assignment_ixiy_integration.test.ts',
  'test/pr887_assignment_half_index_integration.test.ts',
  'test/pr895_assignment_ea_ea_integration.test.ts',
  'test/pr896_assignment_ea_ea_integration.test.ts',
  'test/pr1049_record_named_init_data_lowering.test.ts',
  'test/pr1334_typed_aggregate_local.test.ts',
  'test/lowering/pr1340_aggregate_param.test.ts',
  'test/lowering/pr1344_addr_of_type.test.ts',
];

const result = spawnSync('npx', ['vitest', 'run', ...tests], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
```

The exact list may be adjusted after checking `docs/audits/zax-test-retirement-map.md`, but keep it explicit.

- [ ] **Step 2: Add package script**

Add:

```json
"test:zax:compat": "node scripts/dev/run-zax-compat-tests.mjs"
```

- [ ] **Step 3: Confirm alpha runner has only AZM keep buckets**

Ensure `scripts/dev/run-azm-alpha-guardrails.mjs` includes:

- register-care tests
- AZM flat/native frontend tests
- layout constant tests
- directive alias and ASM80 baseline tests
- op/register-care tests

Ensure it does not include typed assignment, generated frames, structured control lowering, typed storage, or typed extern tests.

- [ ] **Step 4: Update audit docs**

In `docs/audits/azm-alpha-test-buckets.md`, add the command names:

```markdown
Default AZM lane: `npm run test:azm:alpha`
Compatibility lane: `npm run test:zax:compat`
```

In `docs/audits/zax-test-retirement-map.md`, add a section listing the exact test files in the first compatibility runner.

- [ ] **Step 5: Verify**

```bash
npm run test:azm:alpha
npm run test:zax:compat
```

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/dev/run-zax-compat-tests.mjs scripts/dev/run-azm-alpha-guardrails.mjs docs/audits/azm-alpha-test-buckets.md docs/audits/zax-test-retirement-map.md docs/reference/testing-verification-guide.md
git commit -m "Add explicit ZAX compatibility test lane"
```

---

## Task 4: Repair And Strengthen Corpus Guardrails

**Owner:** Worker D**

**Files:**

- Modify: `scripts/dev/run-azm-corpus-guardrails.mjs`
- Modify: `docs/reference/testing-verification-guide.md`
- Test if needed: `test/asm80/tetro_acceptance.test.ts`

**Purpose:** Make `npm run test:azm:corpus` actually validate available local corpora read-only. Current script guesses `src/main.asm`, which does not match Tetro/Pacmo.

- [ ] **Step 1: Replace hardcoded wrong entries**

Update corpus checks to include known local Tetro repo entries:

```js
const CORPUS_CHECKS = [
  {
    repo: 'tetro',
    name: 'tetro',
    entry: 'src/tetro/tetro.z80',
    cwd: 'src',
    asm80Args: ['-m', 'Z80', '-t', 'hex', '-o'],
  },
  {
    repo: 'tetro',
    name: 'pacmo',
    entry: 'src/pacmo/pacmo.z80',
    cwd: 'src',
    asm80Args: ['-m', 'Z80', '-t', 'hex', '-o'],
  },
];
```

Do not edit the Tetro repo. Write outputs to a temporary directory.

- [ ] **Step 2: Compare AZM to ASM80**

For each available corpus entry:

1. Run ASM80 to HEX.
2. Run AZM CLI to HEX.
3. Normalize only final newline differences.
4. Fail if payload differs.

Use `node dist/src/cli.js --type hex --output <tmp>/<name>.azm.hex <absolute-entry>`.

- [ ] **Step 3: Handle missing tools/repos cleanly**

If `asm80` is missing, print:

```text
SKIP corpus: asm80 not found
```

If a repo is missing, print `SKIP`.

If MON3 path/entry is unknown, keep it skipped with a clear message rather than guessing.

- [ ] **Step 4: Verify locally**

```bash
npm run build
npm run test:azm:corpus
```

Expected on John’s machine: Tetro and Pacmo should compile and compare against ASM80. Missing MON3 may skip.

- [ ] **Step 5: Document**

In `docs/reference/testing-verification-guide.md`, document:

- Corpus guardrail is optional/local.
- It is read-only.
- It compares AZM output to ASM80 output.
- Run it before parser, directive, include, and emission PRs.

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/run-azm-corpus-guardrails.mjs docs/reference/testing-verification-guide.md test/asm80/tetro_acceptance.test.ts
git commit -m "Compare AZM corpus output with ASM80"
```

Omit unchanged files.

---

## Task 5: First Safe ZAX Dependency Quarantine

**Owner:** Worker E

**Files:**

- Modify: `docs/audits/zax-test-retirement-map.md`
- Modify: `docs/audits/azm-removal-inventory.md`
- Modify: `test/migration-tracker.md` if relevant
- Modify only tests if they are clearly moved to `test:zax:compat`

**Purpose:** Prepare actual deletion by identifying the first batch of high-level ZAX tests that default AZM development no longer needs. This task should be conservative: classify and move/skip only when covered by the compatibility runner.

- [ ] **Step 1: Inventory tests by forbidden feature**

Run:

```bash
rg -n "func |export func|:=|section code|section data|globals|extern func|\\bif\\b|\\bwhile\\b|\\brepeat\\b|\\bselect\\b" test src docs/audits
```

Write findings into `docs/audits/zax-test-retirement-map.md` under:

```markdown
## First quarantine batch
```

- [ ] **Step 2: Identify tests safe for compatibility lane only**

Choose tests that:

- use `.zax` fixtures only,
- assert generated function frames, typed assignment, typed storage, or structured control,
- are not referenced by `npm run test:azm:alpha`,
- are included in `npm run test:zax:compat` from Task 3.

- [ ] **Step 3: Do not delete compiler code**

This task must not delete implementation files. Its output is classification plus optional test relocation/skip if the repo already has a pattern for compatibility-only tests.

- [ ] **Step 4: Update removal inventory**

In `docs/audits/azm-removal-inventory.md`, mark Phase 2 as in progress and add:

```markdown
The first compatibility lane is `npm run test:zax:compat`. No ZAX-only implementation should be deleted until this lane is green and default AZM guardrails no longer depend on those tests.
```

- [ ] **Step 5: Verify docs**

```bash
git diff --check
```

If any test files are moved/changed:

```bash
npm run test:azm:alpha
npm run test:zax:compat
```

- [ ] **Step 6: Commit**

```bash
git add docs/audits/zax-test-retirement-map.md docs/audits/azm-removal-inventory.md test/migration-tracker.md test
git commit -m "Classify first ZAX compatibility quarantine batch"
```

---

## Task 6: AZM Surface Handover And Deletion Readiness

**Owner:** Worker F

**Files:**

- Modify: `docs/handover-one.md`
- Modify: `docs/design/azm-language-direction.md`
- Modify: `docs/design/azm-expression-and-visibility.md`
- Modify: `docs/spec/azm-assembly-baseline.md`

**Purpose:** Update the canonical handover and design docs after Tasks 1-5 so the next agent knows exactly what is feature-complete, what is compatibility-only, and what can be deleted next.

- [ ] **Step 1: Update handover status**

In `docs/handover-one.md`, add a new section:

```markdown
## Handover Two Delta
```

Include:

- native `.azm` accepted syntax,
- native `.azm` rejected syntax,
- test lanes,
- corpus guardrail status,
- register-care/op expansion status,
- next deletion candidates.

- [ ] **Step 2: Update language direction**

In `docs/design/azm-language-direction.md`, ensure the near-term AZM shape says:

- flat labels and calls, no `func`;
- `.org` + labels + raw data, no named `section` blocks;
- `op` visible expansion is the only runtime code-generation extension;
- layout casts fold to constants only.

- [ ] **Step 3: Update baseline spec**

In `docs/spec/azm-assembly-baseline.md`, add a concise native `.azm` section:

```markdown
## Native `.azm` Source

Native AZM accepts flat assembler items at module scope:
labels, Z80 instructions, `.org`, `.equ`, `.db`, `.dw`, `.ds`,
includes, `op` declarations, and layout metadata.

Native AZM rejects inherited ZAX high-level constructs:
`func`, named `section` blocks, `:=`, structured control,
typed storage, and typed externs.
```

- [ ] **Step 4: Verify docs**

```bash
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add docs/handover-one.md docs/design/azm-language-direction.md docs/design/azm-expression-and-visibility.md docs/spec/azm-assembly-baseline.md
git commit -m "Update AZM native surface handover"
```

---

## Controller Integration Steps

After all workers finish:

1. Check commits:

```bash
git log --oneline --decorate -12
git status --short
```

2. Resolve expected overlap:

- `package.json` may be touched by Worker C only.
- `docs/reference/testing-verification-guide.md` may be touched by Workers C/D; manually merge sections.
- `docs/handover-one.md` should be updated last by Worker F or controller.

3. Run focused suites:

```bash
node node_modules/vitest/vitest.mjs run \
  test/frontend/azm_flat_module_asm.test.ts \
  test/frontend/azm_native_boundary.test.ts \
  test/frontend/azm_source_mode_deprecations.test.ts \
  test/semantics/layout_cast_constants_azm.test.ts \
  test/semantics/layout_constants_azm.test.ts \
  test/registerCare/opExpansion.integration.test.ts \
  test/registerCare
```

4. Run lanes:

```bash
npm run test:azm:alpha
npm run test:zax:compat
npm run test:azm:corpus
```

5. Run full suite if parser/lowering/register-care changed:

```bash
npm test
```

6. Update `docs/handover-one.md` final verification block with actual command results.

## Success Criteria

- `.azm` accepts the intended assembler-shaped feature set.
- `.azm` errors on every listed high-level ZAX construct.
- Register-care sees visible `op` expansion effects.
- Default AZM guardrail is not dependent on high-level `.zax` behavior.
- ZAX compatibility has a named optional test lane.
- Tetro/Pacmo local corpus comparison uses AZM vs ASM80 and is read-only.
- Docs clearly state what can be deleted later and what must remain.
