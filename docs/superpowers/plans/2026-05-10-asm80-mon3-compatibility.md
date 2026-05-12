# ASM80 MON3 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest ASM80/classic source mode needed to assemble the recursive TEC-1G MON3 source tree and compare output bytes with the existing MON3 artifact.

**Architecture:** Keep typed ZAX semantics where they add value, but prefer ASM80 spelling for overlapping raw assembler features. Add a classic source path that parses ASM80-style top-level lines into the existing internal assembly/lowering/emission model where possible, with new small adapters for classic labels, equates, origins, raw data, includes, and artifact-range metadata.

**Tech Stack:** TypeScript, existing ZAX frontend/parser modules, existing Z80 encoder/lowering/emission pipeline, Vitest.

---

## File Map

- `src/frontend/parseImm.ts` - extend numeric literal parsing for ASM80 trailing-base literals.
- `src/frontend/asm80/` - new focused classic ASM80 parsing helpers.
- `src/frontend/asm80/parseClassicModule.ts` - parse classic ASM80 modules without changing current `.zax` grammar.
- `src/moduleLoader.ts` - support classic `.include` expansion and source-mode selection.
- `src/pipeline.ts`, `src/compile.ts`, `src/cli.ts` - expose source mode and route `.z80`/`.asm` files to classic mode.
- `src/lowering/programPrescan.ts`, `src/lowering/programLoweringTraversal.ts`, `src/lowering/programLoweringDeclarations.ts` - add top-level classic symbols/items without routing through function lowering.
- `src/lowering/` and `src/formats/` - preserve `.org` placement and `.binfrom` metadata through emission.
- `src/z80/` - fill only MON3-exposed instruction gaps.
- `test/fixtures/asm80/` - small fixtures for each syntax slice.
- `test/asm80/mon3_acceptance.test.ts` - MON3 acceptance harness that skips when the external MON3 tree is unavailable.
- `docs/design/asm80-mon3-compatibility-audit.md` - requirement source for this milestone.

## Task Decomposition and Parallelism

Critical path:

1. Source-mode selection and classic parser shell.
2. Classic literals, labels, directives, and include expansion.
3. Placement/data emission.
4. MON3 run, missing opcode closure, byte comparison.

Parallel work:

- Literal parsing can be implemented independently.
- Instruction coverage audit can run in parallel once a corpus opcode extractor exists.
- CLI/API source-mode plumbing can run in parallel with parser helpers after the source-mode enum is agreed.
- Documentation and fixture curation can run in parallel throughout.

Recommended subagent split during implementation:

- Worker A: literals and expression support (`H`/`B`, lowercase suffixes, `$`, string arithmetic).
- Worker B: classic line/module parser and include expansion.
- Worker C: classic lowering/placement/raw data.
- Worker D: opcode gap closure from the MON3 harness.

## Syntax Convergence Decisions

Use these decisions while implementing:

- Prefer `.include` over `include` for text insertion in classic/assembler-facing docs and examples.
- Support `.equ` for ASM80-style raw numeric or string constants.
- Keep `const` as a clean ZAX-level spelling; do not treat `.equ` as a direct replacement for every `const` use.
- Prefer `.align` over `align` for raw assembler alignment.
- Prefer dotted `.db`, `.dw`, `.ds` in classic source, while accepting undotted aliases where cheap.
- Add `.cstr`, `.pstr`, and `.istr` as early follow-up directives because they reduce hand-written string boilerplate.
- Skip `.macro`, `.rept`, `.endm`, `.block`, and `.endblock` for this milestone and do not design around them.
- Keep ZAX-only syntax for typed storage, records/unions, value-level storage transfer, structured control, and typed callable boundaries.

## Task 1: Add ASM80 Literal Tests

**Files:**
- Modify: `test/frontend/pr476_parse_imm_helpers.test.ts`

- [ ] **Step 1: Add failing tests for trailing-base literals**

Add tests covering:

```ts
expect(parseImmExprFromText(file.path, '0FFH', zeroSpan, diagnostics)).toMatchObject({
  kind: 'ImmLiteral',
  value: 0xff,
});
expect(parseImmExprFromText(file.path, '0ffh', zeroSpan, diagnostics)).toMatchObject({
  kind: 'ImmLiteral',
  value: 0xff,
});
expect(parseImmExprFromText(file.path, '1010B', zeroSpan, diagnostics)).toMatchObject({
  kind: 'ImmLiteral',
  value: 0b1010,
});
expect(parseImmExprFromText(file.path, '1010b', zeroSpan, diagnostics)).toMatchObject({
  kind: 'ImmLiteral',
  value: 0b1010,
});
expect(parseImmExprFromText(file.path, 'FFH', zeroSpan, diagnostics)).toMatchObject({
  kind: 'ImmName',
  name: 'FFH',
});
expect(parseImmExprFromText(file.path, '00000000b', zeroSpan, diagnostics)).toMatchObject({
  kind: 'ImmLiteral',
  value: 0,
});
```

Use the helper style already present in
`test/frontend/pr476_parse_imm_helpers.test.ts`: pass `file.path`, `zeroSpan`,
and a local diagnostics array to `parseImmExprFromText()`.

- [ ] **Step 2: Run the focused test**

Run:

```bash
npx vitest run test/frontend/pr476_parse_imm_helpers.test.ts
```

Expected: tests for `0FFH`, `0ffh`, `1010B`, and `1010b` fail before implementation.

## Task 2: Implement ASM80 Literal Parsing

**Files:**
- Modify: `src/frontend/parseImm.ts`

- [ ] **Step 1: Extend `parseNumberLiteral`**

Implement these rules:

- `/^[0-9][0-9A-Fa-f]*[Hh]$/` parses as hexadecimal after removing suffix.
- `/^[01]+[Bb]$/` parses as binary after removing suffix.
- `FFH` is not numeric because it does not start with a digit.
- malformed binary-suffix forms such as `102B` are not numeric.
- lowercase suffixes are accepted.

- [ ] **Step 2: Run literal tests**

Run:

```bash
npx vitest run test/frontend/pr476_parse_imm_helpers.test.ts
```

Expected: passing.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/parseImm.ts test/frontend/pr476_parse_imm_helpers.test.ts
git commit -m "feat(asm80): parse trailing-base numeric literals"
```

## Task 3: Add Classic Source Mode Contract

**Files:**
- Create: `src/frontend/sourceMode.ts`
- Modify: `src/pipeline.ts`
- Modify: `src/compile.ts`
- Modify: `src/cli.ts`
- Test: `test/cli/cli_contract_matrix.test.ts`

- [ ] **Step 1: Define source mode**

Create:

```ts
export type SourceMode = 'zax' | 'asm80';

export function inferSourceMode(filePath: string): SourceMode {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.z80') || lower.endsWith('.asm')) return 'asm80';
  return 'zax';
}
```

- [ ] **Step 2: Thread `sourceMode?: SourceMode` through compile options**

Add an optional source-mode field to the compiler options surface. Default to `inferSourceMode(entryFile)` where the entry path is known.

- [ ] **Step 3: Add CLI smoke tests**

Add tests that `.zax` still uses current mode and `.z80` is accepted as an entry suffix for the new path. The parser can still return a clear "classic ASM80 mode not implemented" diagnostic until Task 4.

- [ ] **Step 4: Run CLI contract tests**

Run:

```bash
npx vitest run test/cli/cli_contract_matrix.test.ts
```

Expected: passing.

## Task 4: Build Classic Logical-Line Parser Shell

**Files:**
- Create: `src/frontend/asm80/classicLine.ts`
- Create: `src/frontend/asm80/parseClassicModule.ts`
- Test: `test/frontend/asm80_classic_line.test.ts`

- [ ] **Step 1: Write line parser tests**

Cover:

```asm
boot:
kCPI:   cpi
KEYB:   .equ 00H
MCB_RTC .equ 40H
        .org BASE_ADDR+08H
        .db "Enter ",0
        .dw DATA_FROM
        .binfrom 0C000H
        .end
```

Expected parsed line shape:

```ts
type ClassicLine =
  | { kind: 'label'; name: string }
  | { kind: 'equ'; name: string; exprText: string }
  | { kind: 'org'; exprText: string }
  | { kind: 'binfrom'; exprText: string }
  | { kind: 'end' }
  | { kind: 'rawData'; label?: string; directive: 'db' | 'dw'; valuesText: string }
  | { kind: 'instruction'; label?: string; head: string; operandText: string };
```

- [ ] **Step 2: Implement minimal parser**

Rules:

- Strip `;` comments outside strings using existing comment stripping behavior where possible.
- Parse a leading `name:` label.
- If remaining text is empty, emit a label line.
- Parse `name .equ expr` and `name: .equ expr`.
- Parse dotted directives case-insensitively.
- Parse instruction head plus raw operand tail.

- [ ] **Step 3: Run line parser tests**

Run:

```bash
npx vitest run test/frontend/asm80_classic_line.test.ts
```

Expected: passing.

## Task 5: Map Classic Lines Into Existing AST/Assembly Model

**Files:**
- Modify: `src/frontend/asm80/parseClassicModule.ts`
- Modify: `src/frontend/ast.ts`
- Test: `test/frontend/asm80_classic_module.test.ts`

- [ ] **Step 1: Write module-level tests**

Fixture:

```asm
BASE: .equ 0C000H
.org BASE
start:
  ld a, 0FFH
  jp start
table:
  .db "OK",0
  .dw start
.end
```

Expected:

- no parse diagnostics
- symbols for `BASE`, `start`, and `table`
- instruction/data lines preserved in source order
- parse stops at `.end`

- [ ] **Step 2: Implement classic module mapping**

Reuse existing `AsmLabelNode`, `AsmInstructionNode`, and `RawDataDeclNode`.
Add a narrow `ClassicItemNode` union to `src/frontend/ast.ts` for top-level
classic items rather than overloading function nodes.

- [ ] **Step 3: Run module tests**

Run:

```bash
npx vitest run test/frontend/asm80_classic_module.test.ts
```

Expected: passing.

## Task 6: Add Classic Include Expansion

**Files:**
- Modify: `src/moduleLoader.ts`
- Test: `test/moduleLoader_asm80_include.test.ts`

- [ ] **Step 1: Write include tests**

Create temporary files:

```asm
; main.z80
.include "defs.z80"
.org BASE
start: nop

; defs.z80
BASE: .equ 0C000H
```

Expected:

- include resolves relative to `main.z80`
- source diagnostics can reference `defs.z80`
- no change to current ZAX `include` behavior

- [ ] **Step 2: Implement `.include` recognition for classic mode**

Keep classic include expansion pre-parse, matching ASM80's model.

- [ ] **Step 3: Run include tests**

Run:

```bash
npx vitest run test/moduleLoader_asm80_include.test.ts test/pr950_include_text_only.test.ts
```

Expected: passing.

## Task 7: Implement `.org`, `.equ`, `.db`, `.dw`, `.binfrom`, and `.end` Semantics

**Files:**
- Modify: `src/semantics/env.ts`
- Modify: `src/lowering/programPrescan.ts`
- Modify: `src/lowering/programLoweringTraversal.ts`
- Modify: `src/lowering/programLoweringDeclarations.ts`
- Modify: `src/lowering/loweredAsmPlacement.ts`
- Modify: `src/formats/writeBin.ts`
- Test: `test/asm80/asm80_directives_integration.test.ts`

- [ ] **Step 1: Write directive integration tests**

Fixture:

```asm
BASE: .equ 0100H
.org BASE
start:
  jp start
msg:
  .db "A",0
ptr:
  .dw start
.binfrom BASE
.end
```

Expected bytes at `$0100`:

```text
C3 00 01 41 00 00 01
```

- [ ] **Step 2: Implement equates**

Equates must be compile-time symbols, case-insensitive in classic mode.

- [ ] **Step 3: Implement origins**

`.org` sets the current placement address. Detect overlapping writes.

- [ ] **Step 4: Implement raw data**

`.db` emits bytes and string bytes. `.dw` emits little-endian words and fixups.

- [ ] **Step 5: Implement `.binfrom` metadata**

Record the binary start address for artifact generation/comparison.

- [ ] **Step 6: Preserve MON3 post-`.end` `.binfrom`**

MON3 writes `.end` before `.binfrom 0C000H`. Accept this narrow output-control
form after `.end`; continue to ignore ordinary code/data after `.end`.

- [ ] **Step 7: Run directive tests**

Run:

```bash
npx vitest run test/asm80/asm80_directives_integration.test.ts
```

Expected: passing.

## Task 8: Build MON3 Opcode Gap Harness

**Files:**
- Create: `scripts/dev/asm80-mon3-audit.mjs`
- Create: `test/asm80/mon3_opcode_gap.test.ts`

- [ ] **Step 1: Add corpus scanner script**

Script input:

```bash
node scripts/dev/asm80-mon3-audit.mjs /Users/johnhardy/Documents/projects/MON3/src/mon3.z80
```

Output:

- recursive include list
- directive counts
- instruction head counts
- unknown heads after comparing with ZAX known heads
- current-location `$` expression count
- single-quoted and double-quoted string expression count

- [ ] **Step 2: Add a non-blocking test**

Snapshot the discovered instruction heads and mark unsupported forms explicitly.

- [ ] **Step 3: Run scanner test**

Run:

```bash
npx vitest run test/asm80/mon3_opcode_gap.test.ts
```

Expected: passing with a clear unsupported-opcode list if gaps remain.

## Task 8A: Add Early ASM80 Convenience Directives

**Files:**
- Modify: `src/frontend/asm80/classicLine.ts`
- Modify: `src/frontend/asm80/parseClassicModule.ts`
- Modify: `src/lowering/programLoweringDeclarations.ts`
- Test: `test/asm80/asm80_string_directives.test.ts`

- [ ] **Step 1: Write string directive tests**

Fixture:

```asm
.org 0100H
cstr_label:
  .cstr "OK"
pstr_label:
  .pstr "OK"
istr_label:
  .istr "OK"
```

Expected bytes at `$0100`:

```text
4F 4B 00 02 4F 4B 4F CB
```

- [ ] **Step 2: Implement `.cstr`**

`.cstr "OK"` emits `4F 4B 00`.

- [ ] **Step 3: Implement `.pstr`**

`.pstr "OK"` emits `02 4F 4B`.

- [ ] **Step 4: Implement `.istr`**

`.istr "OK"` emits `4F CB`, setting bit 7 on the final character.

- [ ] **Step 5: Run string directive tests**

Run:

```bash
npx vitest run test/asm80/asm80_string_directives.test.ts
```

Expected: passing.

## Task 8B: Add `.align` Alias and Prefer It In Docs

**Files:**
- Modify: `src/frontend/asm80/classicLine.ts`
- Modify: `src/lowering/programLoweringTraversal.ts`
- Test: `test/asm80/asm80_align_directive.test.ts`

- [ ] **Step 1: Write `.align` test**

Fixture:

```asm
.org 0101H
.db 0AAH
.align 4
.db 055H
```

Expected writes:

- `$0101 = AA`
- `$0104 = 55`

- [ ] **Step 2: Implement `.align` in classic mode**

Advance the current output address to the next address divisible by the
alignment value.

- [ ] **Step 3: Run `.align` test**

Run:

```bash
npx vitest run test/asm80/asm80_align_directive.test.ts
```

Expected: passing.

## Task 9: Close MON3-Required Z80 Opcode Gaps

**Files:**
- Modify: `src/z80/`
- Test: existing backend tests plus new focused tests under `test/backend/`

- [ ] **Step 1: Run the MON3 gap harness**

Run:

```bash
node scripts/dev/asm80-mon3-audit.mjs /Users/johnhardy/Documents/projects/MON3/src/mon3.z80
```

- [ ] **Step 2: For each missing opcode form, write a focused failing backend test**

Example for `neg` if missing:

```ts
expect(encodeInstruction(instruction('neg', []))).toEqual([0xed, 0x44]);
```

- [ ] **Step 3: Implement only the missing MON3-required form**

Add the encoder case in the matching `src/z80/encode*.ts` file named by the
failing test stack or nearest existing opcode-family test.

- [ ] **Step 4: Run focused backend tests**

Run:

```bash
npx vitest run test/backend
```

Expected: passing.

- [ ] **Step 5: Commit each coherent opcode family**

```bash
git add src/z80 test/backend
git commit -m "feat(asm80): support MON3 Z80 opcode forms"
```

## Task 10: Add MON3 Acceptance Test

**Files:**
- Create: `test/asm80/mon3_acceptance.test.ts`
- Create: `test/fixtures/asm80/mon3-manifest.json`

- [ ] **Step 1: Write acceptance test**

Use the local MON3 source path only when it exists. If it is absent, skip with a clear message.

Expected:

- compile `/Users/johnhardy/Documents/projects/MON3/src/mon3.z80`
- emit binary/hex
- compare bytes against `/Users/johnhardy/Documents/projects/MON3/MON3-1G_BC25-16.bin`

- [ ] **Step 2: Run acceptance test**

Run:

```bash
npx vitest run test/asm80/mon3_acceptance.test.ts
```

Expected: passing locally when MON3 reference files are available.

## Task 11: Regression Sweep

**Files:**
- No expected source edits unless failures expose real regressions.

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: passing.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: passing.

- [ ] **Step 3: Run focused ASM80 tests**

```bash
npx vitest run test/asm80 test/frontend/asm80_classic_line.test.ts test/frontend/asm80_classic_module.test.ts
```

Expected: passing.

- [ ] **Step 4: Run full suite or serial CLI subset if full suite stresses hooks**

```bash
npm test
npx vitest run --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=20000 --hookTimeout=300000 test/cli/cli_artifacts.test.ts test/cli/cli_contract_matrix.test.ts test/cli/cli_failure_contract_matrix.test.ts
```

Expected: full suite passing, or documented full-suite timeout with serial CLI subset passing.

## Self-Review

- Spec coverage: tasks cover literals, classic source mode, labels/equates,
  directives, includes, placement, raw data, opcode closure, MON3 acceptance,
  and regression testing.
- Scope control: macros, conditionals, segments, block includes, string helper
  directives, and full ASM80 compatibility are deliberately excluded.
- Parallelism: literal parsing, source-mode plumbing, opcode audit, and docs can
  be worked independently after Task 3 defines the source-mode contract.
