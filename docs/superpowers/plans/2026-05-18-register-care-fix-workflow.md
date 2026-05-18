# Register-Care Fix Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build an ESLint-style register-care workflow that reports ambiguous outputs with clickable call-site locations, lets programmers confirm intent at call sites, and later supports conservative auto-fix.

**Architecture:** AZM core remains inference-first: opcode effects prove reads/writes, caller liveness creates `maybe-out` candidates, explicit call-site assertions confirm semantic outputs, and generated callee AZM blocks summarize the current proof state. The CLI and future LSP consume the same structured candidate data so terminal reports, fixes, and editor code actions stay consistent.

**Tech Stack:** TypeScript, Vitest, AZM register-care analyzer, CLI artifact/report pipeline.

---

### Task 1: Report Maybe-Out Candidates With Call-Site Locations

**Files:**
- Modify: `src/registerCare/types.ts`
- Modify: `src/registerCare/liveness.ts`
- Modify: `src/registerCare/analyze.ts`
- Modify: `src/registerCare/report.ts`
- Test: `test/registerCare/report.test.ts`
- Test: `test/registerCare/integration.test.ts`

- [x] **Step 1: Write failing report-render test**

Add a test that passes `outputCandidates` to `renderRegisterCareReport` and expects an `Output candidates:` section with clickable `file:line:column` text and a suggested `; expects out A` remedy.

- [x] **Step 2: Run report test to verify it fails**

Run:

```bash
/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run test/registerCare/report.test.ts -t "renders output candidates"
```

Expected: FAIL because `RegisterCareReportModel` has no structured output-candidate field and the report has no section.

- [x] **Step 3: Add candidate observation types**

Add `RegisterCareOutputCandidate` to `src/registerCare/types.ts` with `routine`, `carriers`, `file`, `line`, `column`, and `message`.

- [x] **Step 4: Collect candidate observations**

Extend `findCallerOutputCandidates` or add a sibling function in `src/registerCare/liveness.ts` that records each call site where a callee writes a carrier and the caller reads that carrier later before overwrite.

- [x] **Step 5: Wire observations into analysis/report model**

Add `outputCandidates` to `RegisterCareReportModel` and populate it in `analyzeRegisterCare`.

- [x] **Step 6: Render ESLint-style candidate report section**

Render:

```text
Output candidates:
  src/main.z80:3:5: MASK: A: CALL MASK writes A and caller reads it later; run --fix or add `; expects out A` above the call to confirm.
```

- [x] **Step 7: Run focused and full register-care tests**

Run:

```bash
/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run test/registerCare
```

Expected: PASS.

### Task 2: Parse Call-Site Assertions

**Files:**
- Modify: `src/registerCare/smartComments.ts`
- Modify: `src/registerCare/liveness.ts`
- Modify: `src/registerCare/analyze.ts`
- Test: `test/registerCare/smartComments.test.ts`
- Test: `test/registerCare/integration.test.ts`

- [x] **Step 1: Write failing parser test**

Add parser coverage for:

```asm
; expects out A
CALL MxMask
```

Expected smart comment kind: `expectOut`.

- [x] **Step 2: Run parser test to verify it fails**

Run the smart-comments test filtered to the new case.

- [x] **Step 3: Parse natural call-site syntax**

Teach `parseSmartCommentLine` to accept `expects out` as an alias for existing `@expect-out`.

- [x] **Step 4: Use assertion as local acceptance**

Ensure liveness suppresses the ambiguous output conflict only at the annotated call site.

- [x] **Step 5: Promote callee output from assertion**

Feed explicit call-site assertions into annotation generation so at least one assertion promotes the generated callee block from `maybe-out A` to `out A`.

### Task 3: Conservative Fix Mode

**Files:**
- Modify: `src/registerCare/liveness.ts`
- Modify: `src/registerCare/annotate.ts`
- Modify: `src/cli.ts`
- Modify: `src/pipeline.ts`
- Test: `test/cli/register_care_cli.test.ts`

- [x] **Step 1: Write failing CLI test**

Fixture:

```asm
START:
    ld a,3
    call MASK
    ld d,a
    ret

; Mask prose.
MASK:
    ld c,a
    ld a,$80
    ret
.end
```

Command:

```bash
azm --rc audit --fix main.z80
```

Expected source edit:

```asm
    ; expects out A
    call MASK
```

- [x] **Step 2: Implement only high-confidence auto-fix**

High confidence means direct call, candidate carrier read in the immediate continuation, no intervening call/jump/branch, and no executable instruction rewrite.

- [x] **Step 3: Regenerate callee block from assertion**

After inserting the call-site assertion, annotation generation promotes the callee block to `out A`.

### Task 4: LSP-Ready Code Actions

**Files:**
- Modify or create language-service API files after locating current LSP/service boundary.
- Test: add API-level tests, not editor integration.

- [x] **Step 1: Expose structured candidate diagnostics**

Return candidate diagnostics with file, line, column, carrier, routine, and suggested edit metadata.

- [x] **Step 2: Expose code action edits**

Provide a code action that inserts `; expects out A` above the call site.

- [x] **Step 3: Keep CLI and LSP using the same data**

Do not duplicate candidate inference in LSP-specific code.

---

## Self-Review

Spec coverage: the plan covers CLI line-number reporting, call-site confirmation, conservative fix mode, and the future LSP/code-action path. It keeps generated callee blocks as derived summaries, not hand-maintained source of truth.

Placeholder scan: no task says “TBD” or leaves an implementation decision without a concrete first step.

Type consistency: the plan uses existing `expectOut` naming for internal smart comments and `expects out` as the human-readable call-site syntax.

## Implementation Notes

Current implementation keeps `--fix` conservative. Output candidates are tagged
with `autoFixable` so the CLI report and tooling API can distinguish direct
continuation reads from candidates that need programmer review. Remaining Pacmo
conflicts after `--fix` are therefore still reported, but their messages now say
that manual review is required instead of implying that `--fix` should have
changed them.
