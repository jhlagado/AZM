# ASM80 Baseline Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach the first ASM80 compatibility baseline where ZAX assembles the recursive MON3 source tree and matches the ASM80-built reference binary.

**Architecture:** Keep the current classic ASM80 source path and close only the gaps exposed by MON3 and the documented baseline. Work from small fixture tests into the opt-in MON3 acceptance test, preserving existing `.zax` behavior and keeping macros/text substitution out of scope.

**Tech Stack:** TypeScript, existing ZAX frontend/parser/lowering pipeline, Vitest, local MON3 reference source and binary.

---

## Scope

In scope for this execution cycle:

- MON3-required classic expressions.
- MON3-required classic raw data and equate values.
- MON3 byte-for-byte acceptance against `/Users/johnhardy/Documents/projects/MON3/MON3-1G_BC25-16.bin`.
- Better diagnostic and mismatch reporting for the local MON3 acceptance path.
- Fixture coverage for each compatibility gap before closing it.

Out of scope for this execution cycle:

- VS Code syntax highlighting or LSP work.
- ASM80 macros: `.macro`, `.rept`, `.endm`, `.block`, `.endblock`.
- Full ASM80 directive coverage.
- Non-Z80 processor compatibility.
- Debug80 toolchain replacement.

## Current Baseline

Already implemented on the current branch:

- `.z80` and `.asm` source mode inference.
- Classic line/module parser.
- `.equ`, `.org`, `.include`, `.db`, `.dw`, `.ds`, `.align`, `.cstr`, `.pstr`, `.istr`, `.binfrom`, `.end`.
- Trailing `H`/`B` numeric literals with leading-digit ambiguity handling.
- Recursive MON3 opcode audit with no unsupported encoder forms reported.
- Opt-in byte-for-byte MON3 acceptance test.

Current local blocker from:

```bash
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```

The test currently fails before binary comparison with 164 diagnostics. The
dominant categories are:

- one-character double-quoted expressions such as `" "` and `":"`
- current-location expressions such as `$`, `$+3`, `$ - 4`, `$-APITable`
- string arithmetic such as `"a"-"A"`
- raw string payloads that are not single-byte expression values, such as
  `"2025.16"` and punctuation strings
- at least one comment-stripping/operand case around `ex af,af' ;...`

## Development Process Overview

Phase 1 is the first baseline and is the only phase this plan executes:

1. Remove MON3 parse/expression diagnostics.
2. Assemble MON3 to bytes.
3. Compare ZAX output against the ASM80 reference binary.
4. Investigate and close byte mismatches.
5. Keep the compatibility subset documented and tested.

Later phases, not implemented here:

1. Integrate ZAX as a shadow assembler in Debug80 while ASM80 remains the default.
2. Flip Debug80 defaults after repeated MON3/reference equivalence.
3. Expand the compatibility subset only when real source examples justify it.
4. Reintroduce ZAX enhancements above the assembler baseline.

## Parallel Work Streams

Use five workers plus the main thread during execution.

Main thread:

- Owns the MON3 acceptance harness, integration, final verification, commits, and PR updates.
- Does not take long isolated feature slices unless they block all workers.

Worker A: expression atoms

- Owns current-location `$` and one-character string expression parsing.
- Files: `src/frontend/parseImm.ts`, expression tests.

Worker B: classic raw data and string classification

- Owns distinguishing `.db` string fragments from string-valued expression atoms.
- Files: `src/frontend/asm80/parseClassicModule.ts`, raw data/lowering tests.

Worker C: instruction operand/comment edge cases

- Owns the `ex af,af' ;comment` style failure and any parser path that lets comments reach operand parsing.
- Files: `src/frontend/asm80/classicLine.ts`, `src/frontend/parseAsmInstruction.ts`, classic instruction tests.

Worker D: acceptance diagnostics and mismatch tooling

- Owns better MON3 failure summaries and binary mismatch reports.
- Files: `test/asm80/mon3_acceptance.test.ts`, optional `scripts/dev/` helper.

Worker E: docs and compatibility guardrails

- Owns keeping baseline docs in sync with accepted syntax and explicitly rejecting macro scope creep.
- Files: `docs/design/asm80-compatibility-baseline.md`, `docs/design/asm80-mon3-compatibility-audit.md`.

## Task 1: Make MON3 Acceptance Fail Informatively

**Priority:** P0

**Owner:** Main thread or Worker D

**Files:**

- Modify: `test/asm80/mon3_acceptance.test.ts`

- [ ] **Step 1: Add diagnostic grouping helper**

Add a helper near the top of `test/asm80/mon3_acceptance.test.ts`:

```ts
function summarizeErrors(errors: Array<{ file: string; line: number; message: string }>): string {
  return errors
    .slice(0, 25)
    .map((diagnostic) => `${diagnostic.file}:${diagnostic.line}: ${diagnostic.message}`)
    .join('\n');
}
```

- [ ] **Step 2: Use explicit failure text for diagnostics**

Replace:

```ts
expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
```

with:

```ts
const errors = res.diagnostics.filter((d) => d.severity === 'error');
expect(errors, summarizeErrors(errors)).toEqual([]);
```

- [ ] **Step 3: Add explicit binary length and first mismatch reporting**

Before the final binary equality assertion, add:

```ts
const actual = Buffer.from(bin.bytes);
const expected = readFileSync(manifest.referenceBin);
const firstMismatch = actual.findIndex((value, index) => value !== expected[index]);

expect(actual.length, `actual length ${actual.length}, expected length ${expected.length}`).toBe(
  expected.length,
);
expect(firstMismatch, `first mismatch at offset ${firstMismatch}`).toBe(-1);
expect(actual).toEqual(expected);
```

- [ ] **Step 4: Run the opt-in acceptance test**

Run:

```bash
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected now: still fails, but with a short list of representative diagnostics
instead of dumping all diagnostic objects.

- [ ] **Step 5: Commit**

```bash
git add test/asm80/mon3_acceptance.test.ts
git commit -m "test(asm80): improve MON3 acceptance diagnostics"
```

## Task 2: Support ASM80 Current-Location Expressions

**Priority:** P0

**Owner:** Worker A

**Files:**

- Modify: `src/frontend/parseImm.ts`
- Modify: `src/lowering/loweredAsmTypes.ts` if a lowered expression kind is needed
- Modify: `src/lowering/programLoweringTraversal.ts`
- Modify: `src/lowering/programLoweringDeclarations.ts`
- Test: `test/frontend/pr476_parse_imm_helpers.test.ts`
- Test: `test/asm80/asm80_directives_integration.test.ts`

- [ ] **Step 1: Add failing expression parser tests**

Add tests for:

```ts
parseImmExprFromText(file.path, '$', zeroSpan, diagnostics);
parseImmExprFromText(file.path, '$+3', zeroSpan, diagnostics);
parseImmExprFromText(file.path, '$ - 4', zeroSpan, diagnostics);
parseImmExprFromText(file.path, '$-APITable', zeroSpan, diagnostics);
parseImmExprFromText(file.path, '($-DSAPIFunctions)/2', zeroSpan, diagnostics);
```

Expected AST policy:

- `$` parses as a current-location expression atom.
- `$+3` parses as binary `+`.
- `$ - 4` parses as binary `-`.
- `$-APITable` parses as binary `-` with a symbol.
- `($-DSAPIFunctions)/2` preserves parentheses and division.

- [ ] **Step 2: Run parser tests and confirm failure**

Run:

```bash
npx vitest run test/frontend/pr476_parse_imm_helpers.test.ts
```

Expected: new `$` tests fail.

- [ ] **Step 3: Implement `$` expression parsing**

Add a dedicated current-location atom instead of treating `$` as a symbol name.
Keep it restricted to expression parsing; do not make `$` a legal label.

- [ ] **Step 4: Lower current-location atoms**

When lowering classic code/data, resolve `$` to the current address in the
active section at the point where the expression is evaluated.

Important cases:

- branch operands: `jr z,$+5`, `djnz $`
- raw data expressions: `.db $-APITable`
- word data expressions: `.dw $`
- computed counts: `.db ($-DSAPIFunctions)/2`

- [ ] **Step 5: Add compile fixture**

Add a focused compile test with:

```asm
.org 0100H
start:
  jr $
  jr z,$+4
here:
  .db $-start
  .dw $
```

Assert no diagnostics and expected bytes.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run test/frontend/pr476_parse_imm_helpers.test.ts test/asm80/asm80_directives_integration.test.ts
```

Expected: passing.

- [ ] **Step 7: Commit**

```bash
git add src test
git commit -m "feat(asm80): support current-location expressions"
```

## Task 3: Support One-Character String Expressions

**Priority:** P0

**Owner:** Worker A, after Task 2 parser shape is settled

**Files:**

- Modify: `src/frontend/parseImm.ts`
- Modify: expression evaluation code under `src/semantics/` or `src/lowering/`
- Test: `test/frontend/pr476_parse_imm_helpers.test.ts`
- Test: `test/asm80/asm80_directives_integration.test.ts`

- [ ] **Step 1: Add failing tests**

Add parser/evaluation tests for:

```ts
'" "'
'":"'
'"Y"'
'"a"-"A"'
```

Expected values:

- `" "` is `0x20`
- `":"` is `0x3a`
- `"Y"` is `0x59`
- `"a"-"A"` is `0x20`

- [ ] **Step 2: Reject multi-character strings in expression position**

Add a diagnostic test for:

```asm
.equ BAD "2025.16"
ld a,"NO"
```

Expected: diagnostic explains that multi-character strings are valid as `.db`
string fragments, not scalar expression values.

- [ ] **Step 3: Implement string expression atom**

Parse double-quoted one-character strings as immediate expression literals.
Preserve `.db "text"` behavior separately in classic raw data parsing.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run test/frontend/pr476_parse_imm_helpers.test.ts test/asm80/asm80_directives_integration.test.ts
```

Expected: passing.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(asm80): support character string expressions"
```

## Task 4: Harden Classic `.db` String Fragment Parsing

**Priority:** P0

**Owner:** Worker B

**Files:**

- Modify: `src/frontend/asm80/parseClassicModule.ts`
- Modify: `src/lowering/programLoweringDeclarations.ts`
- Test: `test/asm80/asm80_directives_integration.test.ts`
- Test: `test/frontend/asm80_classic_module.test.ts`

- [ ] **Step 1: Add fixture tests for MON3-style `.db` strings**

Add tests for:

```asm
.db "Enter ",0
.db '<_>?)!@#$%^&*( : +|'
.db "2025.16"
.db "A,B",0
.db "a"-"A"
```

Expected behavior:

- string fragments emit one byte per character
- commas inside strings do not split values
- punctuation strings remain raw byte fragments
- `"a"-"A"` is an expression, not a raw string fragment, because it has an
  operator outside the quotes

- [ ] **Step 2: Run focused tests and confirm current failures**

Run:

```bash
npx vitest run test/frontend/asm80_classic_module.test.ts test/asm80/asm80_directives_integration.test.ts
```

- [ ] **Step 3: Implement token classification**

In `parseClassicRawValues`, keep using top-level comma splitting, then classify:

- whole double-quoted token with no outside operator: `ClassicString`
- single-quoted raw string token with more than one character: `ClassicString`
- otherwise: `parseImmExprFromText`

Do not route all quoted text through expression parsing.

- [ ] **Step 4: Verify lowered bytes**

Add compile assertions that emitted bytes match the source strings and that
ASM80 artifact output remains valid `DB` lines.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run test/frontend/asm80_classic_module.test.ts test/asm80/asm80_directives_integration.test.ts test/asm80/asm80_string_directives.test.ts
```

Expected: passing.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/asm80/parseClassicModule.ts src/lowering/programLoweringDeclarations.ts test
git commit -m "feat(asm80): parse classic db string fragments"
```

## Task 5: Fix Classic Instruction Comment and AF Prime Handling

**Priority:** P1

**Owner:** Worker C

**Files:**

- Modify: `src/frontend/asm80/classicLine.ts`
- Modify: `src/frontend/parseAsmInstruction.ts` if needed
- Test: `test/frontend/asm80_classic_line.test.ts`
- Test: `test/asm80/asm80_directives_integration.test.ts`

- [ ] **Step 1: Add failing classic line test**

Add:

```ts
expect(parseClassicLine('/classic.z80', "ex af,af'           ;start saving registers", 1, 0)).toEqual({
  kind: 'instruction',
  head: 'ex',
  operandText: "af,af'",
});
```

- [ ] **Step 2: Add compile test**

Compile:

```asm
.org 0100H
ex af,af'           ;start saving registers
```

Assert bytes:

```ts
expect([...bin.bytes]).toEqual([0x08]);
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
npx vitest run test/frontend/asm80_classic_line.test.ts test/asm80/asm80_directives_integration.test.ts
```

- [ ] **Step 4: Fix parser path**

Ensure comments are stripped before operand parsing for every classic source
path, including included files and label-plus-instruction lines. Preserve the
prime suffix in `af'`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run test/frontend/asm80_classic_line.test.ts test/asm80/asm80_directives_integration.test.ts
```

Expected: passing.

- [ ] **Step 6: Commit**

```bash
git add src/frontend test
git commit -m "fix(asm80): strip classic comments before operand parsing"
```

## Task 6: Reach Zero MON3 Diagnostics

**Priority:** P0

**Owner:** Main thread integrating Workers A, B, C

**Files:**

- Modify as needed based on remaining diagnostics.
- Test: `test/asm80/mon3_acceptance.test.ts`

- [ ] **Step 1: Run opt-in acceptance**

Run:

```bash
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected after Tasks 2-5: either zero diagnostics and a binary mismatch, or a
small new diagnostic set.

- [ ] **Step 2: Classify remaining diagnostics**

For every remaining diagnostic, add it to one of these buckets:

- expression parser gap
- classic raw data classifier gap
- instruction operand parser gap
- symbol/equate resolution gap
- placement/fixup gap

- [ ] **Step 3: Add one focused fixture per bucket**

Do not fix directly against MON3 only. Add a minimal fixture test that reproduces
each bucket, then implement the fix.

- [ ] **Step 4: Repeat until diagnostics are zero**

Run:

```bash
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected: no diagnostics. The test may still fail on binary comparison.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(asm80): compile MON3 without diagnostics"
```

## Task 7: Compare and Close MON3 Binary Mismatches

**Priority:** P0

**Owner:** Main thread plus Worker D

**Files:**

- Modify: `test/asm80/mon3_acceptance.test.ts`
- Optional create: `scripts/dev/compare-mon3-binary.mjs`
- Modify source files based on mismatch cause

- [ ] **Step 1: Run acceptance to first binary mismatch**

Run:

```bash
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected: no diagnostics; failure reports length or first mismatch.

- [ ] **Step 2: Add mismatch helper if needed**

If the first mismatch report is not enough, create
`scripts/dev/compare-mon3-binary.mjs` that:

- compiles MON3 with ZAX
- reads the reference binary
- prints actual length, expected length, and the first 20 mismatch offsets
- prints bytes as two-digit hex

- [ ] **Step 3: Classify mismatch cause**

Use the first mismatch offset to identify the source address and classify:

- branch displacement
- current-location expression value
- raw data encoding
- `.org` placement
- `.binfrom` trimming
- word endianness
- instruction encoding

- [ ] **Step 4: Add focused fixture**

For each mismatch category, add a small test that fails before the fix. Do not
only adjust MON3 acceptance.

- [ ] **Step 5: Fix and rerun**

Run:

```bash
npx vitest run test/asm80 test/frontend/asm80_classic_line.test.ts test/frontend/asm80_classic_module.test.ts test/frontend/pr476_parse_imm_helpers.test.ts
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected: focused tests pass and MON3 mismatch moves forward or disappears.

- [ ] **Step 6: Commit after each category**

```bash
git add src test scripts
git commit -m "fix(asm80): match MON3 <category> encoding"
```

Use a specific category name in the actual commit message.

## Task 8: Promote Baseline Verification Command

**Priority:** P1

**Owner:** Worker D

**Files:**

- Modify: `package.json`
- Modify: `docs/reference/testing-verification-guide.md`
- Test: `test/asm80/mon3_acceptance.test.ts`

- [ ] **Step 1: Add package script**

Add:

```json
"test:asm80:mon3": "ZAX_RUN_MON3_ACCEPTANCE=1 vitest run test/asm80/mon3_acceptance.test.ts"
```

If cross-platform shell syntax is a concern for CI, keep the package script out
and document the environment variable command instead.

- [ ] **Step 2: Document local prerequisite**

Add to `docs/reference/testing-verification-guide.md`:

```md
### MON3 ASM80 Baseline

The byte-for-byte MON3 acceptance check is local and opt-in because it depends
on `/Users/johnhardy/Documents/projects/MON3`.

Run:

```bash
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```
```

- [ ] **Step 3: Run docs and focused checks**

Run:

```bash
npm run typecheck -- --pretty false
npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected: typecheck passes; default MON3 acceptance remains skipped/todo unless
`ZAX_RUN_MON3_ACCEPTANCE=1` is set.

- [ ] **Step 4: Commit**

```bash
git add package.json docs/reference/testing-verification-guide.md test/asm80/mon3_acceptance.test.ts
git commit -m "docs(asm80): document MON3 baseline verification"
```

## Task 9: Baseline Documentation Update

**Priority:** P1

**Owner:** Worker E

**Files:**

- Modify: `docs/design/asm80-compatibility-baseline.md`
- Modify: `docs/design/asm80-mon3-compatibility-audit.md`
- Modify: `docs/design/asm80-first-language-track.md`

- [ ] **Step 1: Update status**

When MON3 binary equivalence passes, change the baseline status from policy to
achieved baseline candidate.

- [ ] **Step 2: Record accepted expression support**

Add current-location `$` and one-character string expressions to the current
implementation status section.

- [ ] **Step 3: Record excluded features unchanged**

Confirm the docs still explicitly exclude:

- macros
- repeat blocks
- non-Z80 processors
- broad unneeded ASM80 directives

- [ ] **Step 4: Run Markdown sanity checks**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add docs/design/asm80-compatibility-baseline.md docs/design/asm80-mon3-compatibility-audit.md docs/design/asm80-first-language-track.md
git commit -m "docs(asm80): mark MON3 baseline status"
```

## Task 10: Final Verification and PR Update

**Priority:** P0

**Owner:** Main thread

**Files:**

- No planned source edits unless verification exposes a blocker.

- [ ] **Step 1: Run full local verification**

Run:

```bash
npm run build
npm run typecheck -- --pretty false
npm run lint
npm run check:fixture-coverage
npx vitest run test/asm80 test/frontend/asm80_classic_line.test.ts test/frontend/asm80_classic_module.test.ts test/moduleLoader_asm80_include.test.ts test/frontend/pr476_parse_imm_helpers.test.ts
ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected: all pass. The default non-MON3 CI path must still pass without the
local MON3 tree.

- [ ] **Step 2: Check git state**

Run:

```bash
git status --short
```

Expected: only intentional tracked changes; `bin/` remains untracked and should
not be staged.

- [ ] **Step 3: Push branch**

Run:

```bash
git push origin codex/asm80-first-track
```

- [ ] **Step 4: PR reviewer summary**

Post a PR comment containing:

- baseline scope
- explicit macro non-goal
- MON3 acceptance result
- focused test list
- any remaining known limitations

## Execution Order

Critical path:

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 10

Parallelizable:

- Task 2 and Task 4 can start together if both workers agree on the expression
  AST shape for string atoms.
- Task 5 can run in parallel with Tasks 2-4.
- Task 8 can run once Task 1 is complete.
- Task 9 should wait until Task 7 is complete, but Worker E can prepare wording
  in parallel.

Recommended first dispatch:

- Main thread: Task 1.
- Worker A: Task 2.
- Worker B: Task 4.
- Worker C: Task 5.
- Worker D: prepare Task 7 mismatch tooling, but do not change acceptance
  assertions until Task 1 lands.
- Worker E: review docs for baseline consistency, but wait to edit until
  implementation status changes.

## Completion Criteria

The first ASM80 baseline is complete when:

- `ZAX_RUN_MON3_ACCEPTANCE=1 npx vitest run test/asm80/mon3_acceptance.test.ts`
  passes locally.
- The default test suite still passes without requiring the MON3 tree.
- MON3 output bytes match the reference binary.
- The docs still define the compatibility level as the MON3/common ASM80
  subset, not full ASM80.
- Macros remain explicitly out of scope.
