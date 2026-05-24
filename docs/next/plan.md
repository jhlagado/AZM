# AZM Next Completion Plan

Status: active referent for cutover and finalization work. All P1 tasks are
complete. User-visible assembly, BIN/HEX/listing/D8, real-program binary
acceptance, and lowered `.z80` (`emitAsm80`) are fully covered by CI gates
(`test:ci:asm80-parity`). Intentional text improvements over legacy are documented
in `test/differential/asm80-corpus-policy.ts`.

This is the single `docs/next` plan document. It replaces the older staged
implementation plans, parity matrix, promotion criteria, source-of-truth notes,
architecture sketch, and stage evidence files.

## Current State

AZM Next has been promoted to the repository-root implementation under `src/`.
The old implementation is quarantined under `legacy-root-azm/` and remains the
oracle for differential tests.

The original Stages 1-16 are complete as historical delivery slices. Current
work is finalization: closing remaining compatibility gaps, making the public
CLI and artifact contracts unsurprising, and aligning the physical source tree
with the documented architecture.

## Source of Truth

AZM Next is a greenfield implementation, not a greenfield language design.
Observable behavior must be derived in this order:

1. Current repository tests and fixtures.
2. Current AZM implementation behavior, especially through differential tests.
3. Existing docs and AZM book examples.
4. Explicit user-approved decisions for intentional differences.

Treat unsupported or uncertain behavior as unsupported until evidence proves it
belongs in the retained AZM surface. Mark inferences as inferences in PR notes.

Only intentional differences should survive cutover. Classify every mismatch as
one of:

- AZM Next bug
- current AZM bug
- intentional spec tightening
- historical behavior outside the replacement target
- undefined behavior now made explicit

## Architecture Target

The target is a flat ASM80-class Z80 assembler with retained AZM extensions:
directive aliases, AZMDoc metadata, register-care contracts, visible `op`
expansion, enums, and compile-time layout constants.

Everything accepted by the compiler should be one of:

- visible assembly
- compile-time metadata
- output serialization

Hidden typed memory operations, generated frames, structured high-level control
flow, and module/function lowering are not part of AZM Next.

The intended module map is:

```text
src/
  core/           compile orchestration and public contracts
  source/         source files, logical lines, include expansion, provenance
  syntax/         parsing, directive aliases, expressions, operands
  model/          shared data structures with no compiler dependencies
  semantics/      constants, layouts, symbols, validation
  expansion/      op registry, matching, substitution, local-label handling
  assembly/       directives, instruction assembly, sections, fixups, images
  z80/            instruction model, encoder, effects, formatting
  register-care/  AZMDoc contracts, routine model, effects, summaries
  outputs/        BIN, HEX, listing, D8, lowered Z80 writers
  node/           filesystem host and Node-specific integration
  cli/            command-line argument parsing and process adapter
```

Current known drift from that map:

- None tracked. Op expansion lives in `src/expansion/`, layout evaluation in
  `src/semantics/`, Node host code in `src/node/`, CLI adapter in `src/cli/`,
  and `src/formats/` re-exports the promoted `src/outputs/` writers for
  compatibility.

These are finalization tasks. They are not a reason to invent new behavior.

## Parity Status

Compatible rows:

- Source loading
- Include provenance
- Logical line parsing
- Directive aliases
- Labels and local labels
- Immediate expressions
- Current-location `$`
- Forward equates
- Explicit fixup records
- Z80 operand parsing
- Z80 encoding
- `.org` / `ORG`
- `.equ` / `EQU`
- `.db` / `DB`
- `.dw` / `DW`
- `.ds` / `DS`
- String directives
- Alignment
- Binary ranges
- Enums
- Layout declarations
- `sizeof`
- `offset`
- Layout casts
- Visible `op` declarations
- Op overload matching
- Op expansion local labels
- Register-care contracts
- Register-care summaries
- BIN output
- HEX output
- Listing output
- D8 debug map
- CLI flags
- Public compile API
- Tooling API

- **Lowered `.z80` output (`emitAsm80`)** — complete. `check:asm80-coverage` passes
  for all 90 fixture files; root asm80 text parity and external round-trip are gated in
  CI (`npm run test:ci:asm80-parity` on Linux); real-program acceptance (MON3/Tetro/Pacmo)
  passes when sources are present. Intentional text improvements over legacy (symbolic
  branches, normal LD text) are documented in `test/differential/asm80-corpus-policy.ts`.

Current differential status:

- Supported root differential fixtures: 87.
- Unsupported root fixtures: 0.
- Unsupported roster: `test/differential/unsupported-fixtures.ts` (empty).
- Task 2 `diagnostic-wording` bucket: cleared in bulk PR (18 fixtures promoted).

## Remaining Tasks

Priority order:

- P1: user-visible parity and emitted artifact contracts. These tasks gate
  whether AZM Next behaves like the old assembler for users and callers.
- P2: retained AZM feature precision. These tasks protect AZM-specific behavior
  that must not be simplified away, especially register-care.
- P3: maintainability cleanup. These tasks improve the implementation quality
  and source-tree honesty after the user-visible blockers are closed, except
  when a cleanup is required to finish a P1 or P2 task safely.

Execution rules:

- Always finish the active P1 task before starting any P2 or P3 task.
- A task is not finished until its PR has tests, plan updates, subagent review,
  required fixes, passing checks or an explicit CI explanation, and is merged.
- Use parallel subagents for independent inspection, implementation, and review
  work inside the active task, but do not let parallel work start the next task
  before the current PR is merged.
- If a P3 cleanup is discovered while working on P1 or P2, record it here and
  continue the higher-priority task unless the cleanup directly blocks the
  higher-priority implementation.

Remaining priority ladder:

1. P1 - Lowered `.z80` Validation. (complete)
2. P1 - Unsupported Fixture Burn-Down. (complete)
3. P2 - Register-Care Precision Closure. (complete)
4. P3 - Architecture Map Alignment. (complete)
5. P3 - Large-File Decomposition. (complete)
6. P1 - Real-Program Validation. (complete)

Real-program validation is P1 because it proves emitted compatibility, but it
must run after the compiler surface is complete enough for its failures to be
actionable rather than noise.

### 1. CLI Contract Closure

Goal: remove surprise from the cutover CLI surface.

Priority: complete.

Status: complete.

Completed tasks:

- Inspect legacy CLI contract tests and promoted CLI tests.
- Add contract coverage for remaining documented flags.
- Lock down default artifact emission and output path behavior.
- Lock down register-care CLI flag handling.
- Ensure package smoke and public-surface tests match the documented CLI/API
  contracts.

Current proven sub-slice:

- `test/cli` is restored as an active slow-reliability lane.
- `--aliases <file>` is accepted by the CLI, passed through the compile API as
  `directiveAliasFiles`, and supports project directive aliases that extend the
  built-in `azm` profile.
- Project alias files reject collisions with built-in AZM aliases.
- Built-in aliases remain active by default.
- `--case-style` linting is restored across CLI, compile API, and tooling
  analysis. It emits warnings without failing assembly and preserves the legacy
  boundary that labels and hex immediates are not linted as mnemonic/register
  tokens.
- The restored `test/cli` lane now mirrors the source-extension and failure
  contract surface for missing files, source diagnostics, range diagnostics,
  parse-error usage text, uppercase output extensions, and rejected non-source
  entry extensions.
- Register-care CLI flag handling remains covered by the promoted Stage 14 CLI
  integration tests.

Exit condition:

- Met. `CLI flags` moved from partial to compatible.

### 2. Listing and D8 Output Parity

Goal: make listing and D8 emitted artifacts evidence-backed contracts, not only
available outputs.

Priority: complete.

Tasks:

- Add golden comparisons or corpus-backed checks for listing output.
- Add shape and content parity checks for D8 debug metadata.
- Extend differential tooling if artifact comparison belongs there.

Current proven sub-slice:

- Listing writer tests now preserve the legacy deterministic byte-dump contract
  for sparse bytes, full-line sparse gap compression, and sparse segment edge
  rendering.
- D8 writer tests now preserve the legacy debug-map contract for sparse global
  segments, deterministic symbol sorting, source-attributed per-file segments,
  and fallback per-file ownership when no addressed symbol claims a segment.
- The shared emitted-byte map model carries source-attributed D8 segments, and
  promoted assembly now populates high-confidence code/directive/macro segments
  from emitted source spans while retaining legacy low-confidence fallback for
  data ranges.
- Differential artifact comparison now includes a small supported D8 corpus for
  the minimal and fixup fixtures, and a Listing corpus for alias/storage,
  minimal, and fixup fixtures.
- Root fixture artifact comparison now gates the currently compatible supported
  fixture set: 66 of 66 supported root fixtures for Listing and 66 of 66
  supported root fixtures for D8.
- Listing sidecars now use the initialized-byte map instead of the dense BIN
  output map, preserving legacy sparse gap rendering in the full supported root
  fixture corpus.
- D8 sidecars now preserve legacy sparse unknown data segment fallback, macro
  attribution for visible `op` expansion, and adjacent same-source segment
  coalescing across the full supported root fixture corpus.

Exit condition:

- Met. `Listing output` and `D8 debug map` moved from partial to compatible.

### 3. Lowered `.z80` Validation

Goal: close the last major emitted-artifact parity gap before real-program
validation.

Priority: P1.

Status: complete — fixture coverage, comment preservation, MON3 opcode audit,
real-program lowering (MON3/Tetro/Pacmo all pass `AZM_RUN_*_ASM80_ACCEPTANCE=1`),
and Linux CI runs `test:ci:asm80-parity` (coverage + external round-trip + real-program
acceptance when sources are present).

Tasks:

- Compare lowered `.z80` output against the current AZM path.
- Add validator-backed or corpus-backed checks where available.
- Document any approved boundary if exact parity is intentionally not required.

Current proven sub-slice:

- File-backed differential runners can request and capture lowered `asm80` / `.z80`
  artifacts from both current AZM and AZM Next.
- The minimal fixture now gates exact lowered ASM80 parity: BIN/HEX output
  matches, both compilers emit a lowered artifact, and exact lowered text
  comparison reports no differences.
- AZM Next now emits canonical lowered ASM80 text for the proven minimal
  boundary: legacy header, `ORG $0100`, resolved constants, canonical casing,
  labels, `ld a, imm`, and `ret`.
- The fixup slice now records an intentional improvement over legacy raw-byte
  lowering: AZM Next emits normal symbolic branch text (`call target`,
  `jr done`, `jr main`) while differential comparison still proves the
  assembled bytes match current AZM.
- AZM Next emits the legacy-compatible implicit `ORG $00` for standalone
  lowered output when the source has no explicit origin.
- The alias/storage fixture now gates normal data lowering for string
  directives, `.db`, `.align`, and `.ds` as standalone `DB`/`DS` ASM80 text.
- `DW` formatting is covered for simple values and simple symbolic label
  operands, preserving readable standalone source instead of forcing labels to
  legacy-flattened numeric addresses.
- The enum/storage fixture now gates the first normal `LD` operand lowering
  slice: `ld reg8, imm` and `ld reg16, (absolute)` forms alongside enum-derived
  constants and storage output.
- The misc ISA fixture plus focused inline coverage now gate normal lowered
  output for all current core zero-operand mnemonics and all modeled `ex` forms.
- The root fixture corpus now gates normal lowered `LD` output for the proven
  register/immediate and memory operand slice: `ld rr, imm16`,
  `ld r8, r8`, `ld a, (bc/de/hl)`, `ld (bc/de), a`, `ld a, (symbol)`,
  and `ld (symbol), a`. AZM Next intentionally emits normal absolute-memory
  `LD` text for `ld a, (symbol)` and `ld (symbol), a` instead of copying
  current AZM's legacy raw-byte `DB $3A` / `DB $32` lowered output.
- The `pr57_isa_im_rst` fixture now gates normal lowered `IM` and `RST` output:
  `im imm`, representative `rst` vectors (0, 8, 56), alongside already-covered `reti`/`retn`.
- The `pr123_isa_alu_a_core` fixture now gates normal lowered accumulator ALU output:
  `add`/`adc`/`sbc` with explicit `a`, single-operand `sub`/`and`/`or`/`cp`, and `xor a`.
- The `pr91_isa_hl16_adc_sbc` fixture now gates normal lowered `adc hl, rr` and
  `sbc hl, rr` forms.
- The `pr126_cb_bitops_reg_matrix` fixture now gates normal lowered `bit`/`res`/`set`
  output across reg8 and `(HL)` operands.
- The `pr113_isa_indexed_bit_setres_dst` fixture now gates indexed lowered
  `bit`/`res`/`set` forms with destination registers.
- The `pr1367_op_port_imm_substitution` fixture now gates normal lowered `in`/`out`
  and `inc` output for op-expanded immediate-port substitution.
- The `pr274_type_padding_*` fixtures now gate lowered `DS` output when reserve
  size uses `sizeof(type)`.
- Intentional lowered-text differences remain for some mixed ISA fixtures such as
  `pr24_isa_core`: AZM Next emits symbolic `jr`/`djnz` branch text instead of legacy
  raw-byte lines, and single-operand ALU text when the source uses the short form
  (`sub b`) even if legacy sometimes preserves explicit `sub a, b` spelling from
  other sources.
- Supported **root differential** fixtures that assemble cleanly generally lower
  without `AZMN_ASM80` in targeted tests; this is not the same as full real-program
  or full-ISA coverage.
- Intentional asm80 **text** exclusions vs legacy current AZM are listed in
  `test/differential/asm80-corpus-policy.ts`; gated parity fixtures are in
  `test/differential/root-fixture-corpus-asm80.test.ts`.
- The writer is intentionally narrow. Unsupported lowered `.z80` formatting
  reports an `AZMN_ASM80` diagnostic instead of silently emitting incomplete
  text. All 90 fixture files and all three real programs (MON3, Tetro, Pacmo)
  now lower without `AZMN_ASM80`.

Exit condition:

- Met. `check:asm80-coverage` passes (90 files), root asm80 text parity and
  external round-trip pass in CI, and all three real programs lower without
  `AZMN_ASM80` when sources are present. Encoder family ports (Tier 3) are done.
  Real-program corpora remain opt-in in GitHub Actions CI (sources not committed);
  maintainers can wire secrets when ready.

### 4. Unsupported Fixture Burn-Down

Goal: reduce the unsupported differential roster until only explicitly accepted
exceptions remain.

Priority: P1.

Status: complete (diagnostic-wording roster empty).

Tasks:

- Burn down `visible-op-diagnostic` fixtures where behavior can be matched or
  intentionally tightened.
- Burn down `diagnostic-wording` fixtures where current AZM wording is retained.
- For every fixture left unsupported, write the accepted reason in
  `test/differential/unsupported-fixtures.ts` and in this plan.

Current proven sub-slice:

- The `pr270_op_invalid_expansion_*` fixtures now match current AZM invalid
  op-expansion diagnostics, including underlying instruction errors, multi-line
  context (`expanded instruction`, `op definition`, `expansion chain`), and
  nested-chain file/line attribution.
- The `visible-op-diagnostic` bucket is empty (3 fixtures promoted to supported).

Exit condition:

- The unsupported roster is empty or reduced to an explicitly approved residue.

### 5. Register-Care Precision Closure

Goal: preserve register-care as a first-class AZM feature, beyond the already
compatible contract parsing and summary surface.

Priority: P2.

Status: complete.

Current compatible boundary:

- `.asmi` interface validation.
- register-care contract parsing through CLI and compile API.
- register-care report summaries for the currently tested routine model.
- register-care tooling diagnostics and code actions for the implemented output
  candidate checks.

Completed sub-slices:

- Added `src/z80/effects.ts` with evidence-backed instruction effect modeling
  (reads/writes, stack, control-flow) for the promoted Z80 instruction AST.
- Replaced linear backward liveness with control-flow-aware dataflow in
  `src/register-care/liveness.ts` and `src/register-care/controlFlow.ts`.
- Wired control-flow-aware auto-fix classification through
  `src/register-care/fix.ts` (`continuationReads` / `findExpectOutFixes`).
- Extended MON3 `registerCareProfile` summaries with `valueRelations` for RST
  service output contracts (e.g. `API_SCANKEYS`).
- Added unit tests: `test/unit/register-care/effects.test.ts`,
  `test/unit/register-care/liveness.test.ts`; existing Stage 14 integration tests
  remain green.

Accepted conservative behavior:

- Routine summary inference remains instruction-local (no fixed-point inter-routine
  propagation from legacy `summary.ts`); profile and `.asmi` contracts supply
  external boundaries.
- Unknown mnemonics (`exx`, etc.) use conservative unknown effects rather than
  silent under-modeling.

Exit condition:

- Met. Remaining limitations are classified above as accepted conservative
  behavior with test coverage.

### 6. Architecture Map Alignment

Goal: make the physical source tree match the architecture target, or update
this plan where the physical layout is intentionally different.

Priority: P3.

Status: complete.

Tasks:

- Move/split op expansion responsibility from `src/core/op-expansion.ts` into
  `src/expansion/`.
- Extract layout and validation logic into `src/semantics/`.
- Move filesystem host responsibilities into `src/node/`.
- Split CLI adapter responsibilities into `src/cli/`.
- Resolve `src/outputs/` versus `src/formats/` duplication.
- Remove empty placeholder directories once they are either populated or
  declared unnecessary.

Current proven sub-slice:

- `src/expansion/op-expansion.ts` owns visible op expansion.
- `src/semantics/expression-evaluation.ts` owns layout/sizeof/offset evaluation.
- `src/node/source-host.ts` owns filesystem include expansion for tooling.
- `src/cli/run.ts` holds CLI parse/run logic; root `src/cli.ts` remains the bin
  entry shim for package exports.
- `src/formats/` re-exports promoted `src/outputs/` types and writers.

Exit condition:

- Met. Architecture map rows above resolve to live modules without empty
  placeholders or legacy-only format shims.

### 7. Large-File Decomposition

Goal: reduce concentrated maintenance risk in oversized coordinator files.

Priority: P3.

Status: complete.

Current size pressure:

- `src/z80/encode.ts`: above hard cap, allowlisted as a dense encoder table.
- `src/z80/parse-instruction.ts`: above hard cap, allowlisted as a dense parser table.
- `src/expansion/op-expansion.ts`: above hard cap, allowlisted as a dense op-expansion registry.
- `src/outputs/write-asm80.ts`: review-trigger warning.
- `src/syntax/parse-expression.ts`: review-trigger warning.
- `src/semantics/expression-evaluation.ts`: review-trigger warning.
- `src/z80/effects.ts`: review-trigger warning.

Tasks:

- Split `src/core/op-expansion.ts` as part of the architecture alignment work. (complete — lives in `src/expansion/`)
- Split `src/register-care/analyze.ts` by analysis phase. (complete — `summaries.ts`, `annotations.ts`)
- Split `src/assembly/assemble-program.ts` by address planning and emission. (complete — `address-planning.ts`, `program-emission.ts`)
- Split `src/cli/run.ts` into parse/run/process adapter pieces. (complete — `parse-args.ts`, `write-artifacts.ts`)
- Keep `src/z80/encode.ts` and `src/z80/parse-instruction.ts` allowlisted only while their table density is more readable than family splits.

Exit condition:

- Met. Remaining large files are either split or deliberately justified in
  `scripts/source-file-size-allowlist.json`.

### 8. Real-Program Validation

Goal: prove the cutover against real programs after feature-completeness
blockers are closed.

Priority: P1, sequenced after Tasks 3-5.

Status: complete for **loadable binary** output — tetro, pacmo, and MON3 pass
byte-for-byte BIN acceptance vs ASM80. **Lowered `.z80` for those programs is not
validated** (Phase 2).

Run in this order:

1. tetro
2. paco (repo path: `tetro/src/pacmo/pacmo.z80`)
3. MON3 monitor ROM software

Promoted harness (under `test/asm80/`) uses `src/api-compile.js` (not legacy
`src/compile.ts`). Opt-in scripts:

```sh
npm run test:asm80:tetro   # AZM_RUN_TETRO_ACCEPTANCE=1
npm run test:asm80:pacmo   # AZM_RUN_PACMO_ACCEPTANCE=1
npm run test:asm80:mon3    # AZM_RUN_MON3_ACCEPTANCE=1
npm run test:azm:corpus    # HEX guardrail for tetro + pacmo when repos/asm80 present
```

Validation results (2026-05-23, local):

| Program    | Command                    | Result                                                  |
| ---------- | -------------------------- | ------------------------------------------------------- |
| Tetro      | `npm run test:asm80:tetro` | PASS — binary matches ASM80 reference (listing-trimmed) |
| Pacmo      | `npm run test:asm80:pacmo` | PASS — binary matches ASM80 reference (listing-trimmed) |
| MON3       | `npm run test:asm80:mon3`  | PASS — full 16 KiB BIN matches ASM80 reference          |
| Corpus HEX | `npm run test:azm:corpus`  | PASS tetro + pacmo HEX vs ASM80                         |

Parity fixes landed for real-program compile (clubbed with harness promotion):

- `@` entry labels in `.asm` sources
- `ld (hl), imm` and `ld r8, (hl)` forms
- case-insensitive symbol lookup for equates/labels/fixups
- `label:.equ` (no space after colon) and string `.equ` expansion in `.db`
- signed 16-bit immediates (`ld de,-16`, `ld hl,0-60h`)
- forward-referenced string equate byte sizing in address planning (MON3
  `REL_TXT` in `.db " Version: ",REL_TXT,0`)

Exit condition:

- Met. All three real-program acceptance checks pass locally with promoted
  `src/api-compile.js`.

Compare generated binary output against the ASM80 reference assembler. If validation
finds a missing retained feature, return that item to this plan before cutover.

## Cutover Blockers

Do not attempt the final cutover claim while any of these remain unclosed or
unapproved:

- Any partial parity row that affects source loading, visible assembly meaning,
  CLI behavior, or emitted artifact contracts.
- The unsupported root fixture roster, unless it is reduced to an explicitly
  accepted residue.
- Module-boundary drift large enough to make this architecture map misleading.
- Transition duplication that obscures which implementation surface is real.
- Unjustified hard-cap source files.

## Validation Commands

Use narrow checks first, then broader gates.

Core local checks:

```sh
npm run typecheck
npm run lint
npm run check:source-file-sizes
npm run check:fixture-coverage
npm run test:ci:coverage-core
npm run test:ci:slow-reliability
npm run next:diff-current:all
npm run test:package
```

For broad finalization PRs:

```sh
npm run next:guardrails
```

Optional external corpus checks:

```sh
npm run test:azm:corpus
npm run test:asm80:baseline
npm run test:asm80:tetro
```

## PR Process

Each finalization slice must:

- close one clear gap or one tightly related group of gaps
- update this plan when parity or blocker status changes
- include tests that prove the behavior boundary
- run the narrow relevant validation first, then the broader guardrail lane
- receive a subagent review focused on regressions, hidden scope growth, and
  evidence coverage before merge
- merge before the next stage begins

## Definition of Ready for Cutover Attempt

AZM is ready for the cutover attempt:

- no unapproved cutover blocker remains in this plan
- user-visible parity rows are compatible
- the unsupported differential roster is explicitly accepted or empty (empty)
- CLI, package, listing, D8, and lowered `.z80` contracts have evidence-backed
  validation
- quality and architecture docs are trustworthy maps of the live codebase
- real-program validation for tetro, pacmo, and MON3 passes locally
