# AZM Next Completion Plan

Status: active referent for post-0.2.1 stabilization and release maintenance.

The promoted implementation under `src/` is now the product implementation.
Historical parity work has been folded into ordinary regression tests, package
smoke tests, external ASM80 round-trip checks, and real-program acceptance gates.
The old oracle tree is not part of the active source tree or release package.

This is the single `docs/next` plan document. It replaces the older staged
implementation plans, parity matrix, promotion criteria, source-of-truth notes,
architecture sketch, and stage evidence files.

## Path to release

Honest status (2026-05-24):

| Lane                              | Status                        | Gate / evidence                                                    |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| User-visible assembly & artifacts | **Strong**                    | Gates green — see **Production gates** below                       |
| Asm80 lowered output              | **Gated, not “done forever”** | `test:ci:asm80-parity` green 2026-05-24; policy must stay on in CI |
| Historical parity audit           | **Release-complete (P1)**     | 9a–9d merged (#191–#194); optional ISA hardening deferred          |
| Layout / includes / examples      | **Done (P1)**                 | 9c layout/env, 9d pr950 + `examples_compile`                       |
| Doc trust                         | **Done (P1)**                 | `source-overview.md` refreshed (#195)                              |

### Production gates (verified 2026-05-24, clean local shell)

| Command                        | Status |
| ------------------------------ | ------ |
| `npm run test:package`         | pass   |
| `npm run next:guardrails:core` | pass   |
| `npm run test:ci:asm80-parity` | pass   |

Current evidence is the checked-in gate configuration plus the latest local/CI
run output on release or maintenance PRs.

### Release readiness verdict

**READY** for release maintenance from a code/CI perspective (production gates
and reference docs complete). Residual optional ISA hardening
(pr132/pr136/pr137/pr126) and `write-asm80.ts` modularization are deferred and
are not blockers while ASM80 CI stays on.

**Remaining before npm publish (process, not code):**

1. Keep `test:ci:asm80-parity` enabled on release branches.
2. For future releases, bump version/changelog, tag, and publish through the
   package release workflow or equivalent npm publish process.

## Current State

AZM Next has been promoted to the repository-root implementation under `src/`.
The old implementation has been retired from the repository and package.

The original Stages 1-16 are complete as historical delivery slices. Current
work is finalization: closing remaining compatibility gaps, making the public
CLI and artifact contracts unsurprising, and aligning the physical source tree
with the documented architecture.

## Source of Truth

AZM is a promoted implementation, not a greenfield language design.
Observable behavior must be derived in this order:

1. Current repository tests and fixtures.
2. Existing docs and AZM book examples where they match the parser and tests.
3. Explicit user-approved decisions for intentional differences.

Treat unsupported or uncertain behavior as unsupported until evidence proves it
belongs in the retained AZM surface. Mark inferences as inferences in PR notes.

Only intentional differences should survive cutover. Classify every mismatch as
one of:

- AZM bug
- intentional spec tightening
- historical behavior outside the replacement target
- undefined behavior now made explicit

## Architecture Target

The target is a flat ASM80-class Z80 assembler with retained AZM extensions:
directive aliases, AZMDoc metadata, register contracts, visible `op`
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
  register-contracts/  AZMDoc contracts, routine model, effects, summaries
  outputs/        BIN, HEX, D8, lowered Z80 writers
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
- Labels and `@` routine-entry labels
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
- Op expansion internal labels
- Register contracts
- Register contracts summaries
- BIN output
- HEX output
- Listing output
- D8 debug map
- CLI flags
- Public compile API
- Tooling API

- **Lowered `.z80` output (`emitAsm80`)** — complete. `check:asm80-coverage`
  passes for all 90 fixture files; promoted lowered-output self-checks and
  external ASM80 round-trip are gated in CI (`npm run test:ci:asm80-parity` on
  Linux); real-program acceptance (MON3/Tetro/Pacmo) passes when sources are
  present.

Current fixture status:

- ASM80 lowering coverage scans 90 fixture files.
- Unsupported lowered-output failures are surfaced by `AZMN_ASM80` diagnostics
  and by `check:asm80-coverage`.
- Task 2 `diagnostic-wording` bucket: cleared in bulk PR (18 fixtures promoted).

## Remaining Tasks

Priority order:

- P1: user-visible parity and emitted artifact contracts. These tasks gate
  whether AZM Next behaves like the old assembler for users and callers.
- P2: retained AZM feature precision. These tasks protect AZM-specific behavior
  that must not be simplified away, especially register contracts.
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
7. **P1 - Historical diagnostic / semantics coverage** (complete)

Real-program validation is P1 because it proves emitted compatibility, but it
must run after the compiler surface is complete enough for its failures to be
actionable rather than noise.

### 9. Historical Diagnostic and Semantics Coverage (complete)

**Goal:** preserve the diagnostic, layout, include, and example coverage that was
needed before release without keeping a second implementation in-tree.

**Policy:** tests now target the promoted implementation directly. Historical
parity notes were used to identify missing cases, then retired once the useful
coverage had been ported.

**Status:** ISA matrix subset **pr144–pr151**, **pr203**, **pr211**, **pr1140** landed in PRs
#178–#184. **Task 9a (pr207–pr210 + pr206/pr202/pr204/pr225)** and **Task 9b (pr129–pr131,
pr133/pr134/pr240)** merged — control-flow / I/O / ALU-pair / arity / register-target matrices.
Layout/semantics, include handling, and example compilation were completed in
the later release increments.

**Asm80 CI (release policy):** `npm run test:ci:asm80-parity` runs coverage,
promoted lowered-output self-checks, external asm80 round-trip (installs asm80
if needed), and real-program emitAsm80 when MON3/Tetro/Pacmo sources are
present (`scripts/ci/run-asm80-parity.mjs`). This is the required gate for
lowered-output confidence.

**Exit condition:** met — matrix coverage, layout/semantics, includes, examples,
ASM80 external round-trip, package smoke, and real-program acceptance gates are
owned by promoted tests and scripts.

### 1. CLI Contract Closure

Goal: remove surprise from the cutover CLI surface.

Priority: complete.

Status: complete.

Completed tasks:

- Inspect legacy CLI contract tests and promoted CLI tests.
- Add contract coverage for remaining documented flags.
- Lock down default artifact emission and output path behavior.
- Lock down register contracts CLI flag handling.
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
- Register contracts CLI flag handling remains covered by the promoted Stage 14 CLI
  integration tests.

Exit condition:

- Met. `CLI flags` moved from partial to compatible.

### 2. D8 Output Parity

Goal: make D8 emitted artifacts evidence-backed contracts, not only available
outputs. `.lst` output was later removed from AZM.

Priority: complete.

Tasks:

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

- Keep lowered `.z80` output behavior covered by promoted self-checks and
  external ASM80 validation.
- Add validator-backed or corpus-backed checks where available.
- Document approved boundaries in tests and public docs.

Current proven sub-slice:

- File-backed runners can request and capture lowered `asm80` / `.z80`
  artifacts from the promoted compiler.
- The minimal fixture gates lowered ASM80 artifact emission and text shape.
- AZM Next now emits canonical lowered ASM80 text for the proven minimal
  boundary: legacy header, `ORG $0100`, resolved constants, canonical casing,
  labels, `ld a, imm`, and `ret`.
- The fixup slice records normal symbolic branch text (`call target`,
  `jr done`, `jr main`).
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
  and `ld (symbol), a`. AZM emits normal absolute-memory `LD` text for
  `ld a, (symbol)` and `ld (symbol), a`.
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
- Mixed ISA fixtures such as `pr24_isa_core` are covered by targeted lowered
  output tests rather than by text comparison to a retired implementation.
- Supported fixtures that assemble cleanly generally lower without
  `AZMN_ASM80` in targeted tests; this is not the same as full real-program or
  full-ISA coverage.
- The writer is intentionally narrow. Unsupported lowered `.z80` formatting
  reports an `AZMN_ASM80` diagnostic instead of silently emitting incomplete
  text. All 90 fixture files and all three real programs (MON3, Tetro, Pacmo)
  now lower without `AZMN_ASM80`.

Exit condition:

- Met. `check:asm80-coverage` passes (90 files), promoted ASM80 self-checks and
  external round-trip pass in CI, and all three real programs lower without
  `AZMN_ASM80` when sources are present. The ISA encoder surface needed for
  fixture and real-program coverage is complete.
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

Goal: preserve register contracts as a first-class AZM feature, beyond the already
compatible contract parsing and summary surface.

Priority: P2.

Status: complete.

Current compatible boundary:

- `.asmi` interface validation.
- register contract parsing through CLI and compile API.
- register contracts report summaries for the currently tested routine model.
- register contracts tooling diagnostics and code actions for the implemented output
  candidate checks.

Completed sub-slices:

- Added `src/z80/effects.ts` with evidence-backed instruction effect modeling
  (reads/writes, stack, control-flow) for the promoted Z80 instruction AST.
- Replaced linear backward liveness with control-flow-aware dataflow in
  `src/register-contracts/liveness.ts` and `src/register-contracts/controlFlow.ts`.
- Wired control-flow-aware auto-fix classification through
  `src/register-contracts/fix.ts` (`continuationReads` / `findExpectOutFixes`).
- Extended MON3 `registerContractsProfile` summaries with `valueRelations` for RST
  service output contracts (e.g. `API_SCANKEYS`).
- Added unit tests: `test/unit/register-contracts/effects.test.ts`,
  `test/unit/register-contracts/liveness.test.ts`; existing Stage 14 integration tests
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

- `src/z80/encode.ts`: soft-limit warning; top-level encoder dispatch is
  table-driven and no longer an active Fallow high-complexity finding.
- `src/z80/encode-ld.ts`: below the 500-line review trigger after helper
  primitives moved into `src/z80/encode-ld-helpers.ts`.
- `src/z80/parse-instruction.ts`: below the 500-line review trigger after
  operand parsing, LD parsing, IO/control parsing, `ex`, branch, and basic
  instruction parsing moved into focused modules.

Tasks:

- Split `src/core/op-expansion.ts` as part of the architecture alignment work. (complete — lives in `src/expansion/`)
- Split `src/register-contracts/analyze.ts` by analysis phase. (complete — `summaries.ts`, `annotations.ts`)
- Split `src/assembly/assemble-program.ts` by address planning and emission. (complete — `address-planning.ts`, `program-emission.ts`)
- Split `src/cli/run.ts` into parse/run/process adapter pieces. (complete — `parse-args.ts`, `write-artifacts.ts`)
- Table-drove CLI argument dispatch and split final option validation out of
  the main parse loop, removing Fallow's `parseCliArgs`/`finalizeCliOptions`
  refactoring target without changing accepted flags. (complete —
  `src/cli/parse-args.ts`)
- Split case-style source-line scanning into line classification and op-body
  state helpers, removing `lintSourceLines` from Fallow's high-complexity list
  while preserving CLI and tooling/API case-style diagnostics. (complete —
  `src/tooling/case-style.ts`,
  `test/cli/cli_case_style_lint.test.ts`)
- Split case-style token diagnostics into consistent-style and fixed-style
  helpers, removing `lintToken` from Fallow's high-complexity list while
  preserving CLI and tooling/API case-style diagnostics. (complete —
  `src/tooling/case-style.ts`,
  `test/cli/cli_case_style_lint.test.ts`)
- Split CLI artifact file writing out of the CLI compile/options helper,
  removing Fallow's high-complexity finding for `writeArtifacts` while keeping
  primary artifact path selection unchanged. (complete —
  `src/cli/artifact-files.ts`, `src/cli/write-artifacts.ts`)
- Split conditional assembly out of `src/core/compile.ts`. (complete — `src/core/conditional-assembly.ts`)
- Split conditional directive dispatch and current-location dependency walking
  into focused helpers, removing Fallow's high-complexity findings for
  `applyConditionalAssembly` and `expressionReferencesCurrentLocation` while
  preserving lowercase `.if/.else/.endif`, equate recording, and
  current-location rejection behavior. (complete —
  `src/core/conditional-assembly.ts`,
  `test/integration/asm80-conditional-and-byte-functions.test.ts`,
  `test/integration/native-syntax-closure.test.ts`)
- Split top-level source parsing into per-line helpers for layout blocks, op
  expansion, and normal line parsing, removing `parseNextSourceItems` from
  Fallow's high-complexity list while preserving conditional assembly,
  op-line skipping, top-level `.end`, and `.binfrom`/`.binto` post-end
  handling. (complete —
  `src/core/compile.ts`,
  `test/unit/compile.test.ts`,
  `test/integration/asm80-conditional-and-byte-functions.test.ts`,
  `test/integration/native-syntax-closure.test.ts`,
  `test/integration/minimal-assembler-stage7-layout.test.ts`,
  `test/integration/minimal-assembler-stage9-ops.test.ts`,
  `test/integration/stage-3-visible-op-diagnostics.test.ts`)
- Split address declaration/symbol helpers out of `src/assembly/address-planning.ts`. (complete — `src/assembly/address-symbols.ts`)
- Table-drove address-state source-item dispatch, removing
  `buildAddressStateOnce` from Fallow's high-complexity list while preserving
  iterative symbol convergence, `.end` handling, placement advancement, and
  final-pass layout validation. (complete —
  `src/assembly/address-planning.ts`,
  `test/integration/stage-4-fixups.test.ts`,
  `test/integration/stage-4-expressions.test.ts`,
  `test/integration/minimal-assembler-stage6-directives.test.ts`,
  `test/integration/minimal-assembler-stage7-layout.test.ts`,
  `test/integration/real-program-parity.test.ts`)
- Table-drove program emission source-item dispatch and extracted emitted-image
  finalization, removing `emitProgramImage` from Fallow's high-complexity list
  while preserving `.end`/`.binfrom`/`.binto` handling, sparse/reserved address
  output, and source-segment clipping. (complete —
  `src/assembly/program-emission.ts`,
  `test/integration/stage-4-fixups.test.ts`,
  `test/integration/minimal-assembler-stage6-directives.test.ts`,
  `test/integration/stage-10-output.test.ts`,
  `test/integration/real-program-parity.test.ts`,
  `test/integration/stage-12-compile-api.test.ts`,
  `test/asm80/asm80_directives_integration.test.ts`)
- Split Z80 effect unit helpers and family builders out of `src/z80/effects.ts`.
  (complete — `src/z80/effect-units.ts`, `src/z80/effect-groups.ts`; mnemonic
  dispatch is now table-driven)
- Table-drove core Z80 zero-operand opcode lookup, removing `coreOpcode` from
  Fallow's high-complexity list while preserving byte encoding for core
  one-byte and ED-prefixed instructions. (complete — `src/z80/encode.ts`,
  `src/z80/encode-core.ts`, `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Split Z80 LD encoding into ordered byte-register, word-register,
  accumulator-indirect, HL-indirect, and indexed encoder families, removing
  `encodeLd` from Fallow's high-complexity list while preserving LD encoding
  behavior. The LD family now lives in its own module so the core encoder
  hard-cap allowlist was not raised. (complete — `src/z80/encode.ts`,
  `src/z80/encode-ld.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Split LD encoder helper primitives out of `src/z80/encode-ld.ts`, bringing
  the LD encoder below the 500-line review trigger while preserving LD
  parser/encoder diagnostic matrix coverage. (complete —
  `src/z80/encode-ld.ts`, `src/z80/encode-ld-helpers.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/unit/z80/pr203-ld-diag-matrix.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`,
  `test/integration/pr203-ld-diag-matrix.test.ts`)
- Replaced top-level Z80 encoder switch dispatch with a mnemonic-to-encoder
  table and focused instruction-family adapters, removing `encodeZ80Instruction`
  from Fallow's high-complexity list while preserving the same per-family
  encoders. (complete — `src/z80/encode.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Simplified ALU source read classification in the Z80 effect groups, removing
  `aluSourceReads` from Fallow's high-complexity list while preserving
  register contracts read/write effects. (complete — `src/z80/effect-groups.ts`,
  `test/unit/register-contracts/effects.test.ts`)
- Table-drove Z80 rotate/shift CB opcode bases, removing
  `rotateShiftOpcodeBase` from Fallow's high-complexity list while preserving
  `sll`/`sls` alias encoding and indexed rotate/shift destination behavior.
  (complete —
  `src/z80/encode.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`,
  `test/integration/pr144-ed-cb-diag-matrix.test.ts`,
  `test/integration/pr225-indexed-rotate-destination-diag-matrix.test.ts`,
  `test/integration/pr129-ed-zero-operand-diag-matrix.test.ts`)
- Reused the shared constant binary operator helper in Z80 parser constant
  folding, removing `constantBinaryExpressionValue` from Fallow's
  high-complexity list while preserving bit/RST constant-expression parsing.
  (complete —
  `src/z80/parse-instruction.ts`,
  `src/semantics/constant-operators.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/unit/z80/pr211-jr-djnz-diag-matrix.test.ts`,
  `test/unit/z80/pr203-ld-diag-matrix.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`,
  `test/integration/pr129-ed-zero-operand-diag-matrix.test.ts`,
  `test/integration/pr131-zero-operand-core-diag-matrix.test.ts`)
- Split constant operator tables into unary, binary, and byte-function modules,
  keeping the existing `constant-operators.ts` import surface as a re-export
  shim while removing `src/semantics/constant-operators.ts` from Fallow's
  active refactoring targets. (complete —
  `src/semantics/constant-operators.ts`,
  `src/semantics/unary-operators.ts`,
  `src/semantics/binary-operators.ts`,
  `src/semantics/byte-functions.ts`,
  `test/unit/semantics/constant-operators.test.ts`)
- Split Z80 instruction operand-list scanning into escape, quote, and
  parenthesis-depth helpers, removing `splitInstructionOperands` from Fallow's
  high-complexity list while preserving comma handling inside strings and
  parenthesized operands. (complete —
  `src/z80/parse-instruction.ts`, `src/z80/operand-split.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/unit/z80/pr1140-encode-error-paths.test.ts`,
  `test/unit/z80/pr203-ld-diag-matrix.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`,
  `test/integration/pr133-arity-diag-matrix.test.ts`,
  `test/integration/pr151-zero-operand-head-diag-matrix.test.ts`)
- Split operand separator state handling out of `src/z80/operand-split.ts`,
  keeping the public splitter as a thin API and removing it from Fallow's
  active refactoring targets. (complete — `src/z80/operand-split.ts`,
  `src/z80/operand-split-state.ts`, `test/unit/z80/operand-split.test.ts`)
- Split the top-level Z80 instruction parser into ordered family parsers,
  removing the original `parseZ80Instruction` Fallow high-complexity finding
  while preserving diagnostic ordering through the same ordered parser list.
  (complete — `src/z80/parse-instruction.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Split Z80 `ex` instruction parsing into its own family module, reducing the
  central parser size while preserving the ordered parser dispatch and existing
  exchange-form diagnostics. (complete — `src/z80/parse-instruction.ts`,
  `src/z80/parse-exchange.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Split Z80 branch parsing (`jp`, `call`, `jr`, `djnz`) and shared condition
  parsing into focused modules, preserving branch target diagnostics while
  moving `src/z80/parse-instruction.ts` below the hard-cap allowlist threshold.
  (complete — `src/z80/parse-instruction.ts`, `src/z80/parse-branch.ts`,
  `src/z80/parse-conditions.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Split Z80 basic instruction parsing (`nop`, `ret`, and core no-operand
  mnemonics) into a focused module, keeping parser dispatch order stable while
  further reducing central parser size. (complete —
  `src/z80/parse-instruction.ts`, `src/z80/parse-basic.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Split shared Z80 operand parsing, LD-family parsing, and IO/control-family
  parsing out of the central parser, bringing `src/z80/parse-instruction.ts`
  below the 500-line review trigger and removing the last active Fallow
  refactoring target while preserving parser dispatch order. (complete —
  `src/z80/parse-instruction.ts`, `src/z80/parse-operands.ts`,
  `src/z80/parse-ld.ts`, `src/z80/parse-io-control.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/unit/z80/pr203-ld-diag-matrix.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`,
  `test/integration/pr130-inout-im-rst-arity-diag-matrix.test.ts`,
  `test/integration/pr203-ld-diag-matrix.test.ts`)
- Removed stale hard-cap source-size allowlist entries after parser, encoder,
  and op-expansion splits brought all allowlisted files below the hard cap.
  (complete — `scripts/source-file-size-allowlist.json`,
  `npm run check:source-file-sizes`)
- Split ASM80 syntax test helpers by alias policy, source parsing, and
  single-line shape parsing, reducing test-helper fan-in/fan-out enough to
  remove `test/unit/syntax/asm80-parse-helpers.ts` from Fallow's active
  refactoring targets. (complete —
  `test/unit/syntax/asm80-alias-helpers.ts`,
  `test/unit/syntax/asm80-source-helpers.ts`,
  `test/unit/syntax/asm80-parse-helpers.ts`,
  `test/unit/syntax/asm80-source-parser.test.ts`,
  `test/unit/syntax/asm-top-level-parser.test.ts`,
  `test/unit/syntax/asm80-logical-line.test.ts`)
- Split ASM80 artifact test helpers by fixture compilation and artifact-kind
  lookup, removing the shared `test/asm80/helpers.ts` refactoring target while
  preserving the ASM80 directive/equate/string/alignment acceptance tests.
  (complete — `test/asm80/compile-fixture.ts`,
  `test/asm80/bin-artifact-helper.ts`,
  `test/asm80/asm80-artifact-helper.ts`,
  `test/asm80/artifact-set-helper.ts`,
  `test/asm80/d8m-artifact-helper.ts`)
- Split binary comparison script helpers into reference execution, listing
  range, mismatch summary, and hex formatting modules, adding focused unit
  coverage so Fallow no longer reports high-CRAP script helpers or active
  script-helper refactoring targets. (complete —
  `scripts/dev/asm80ReferenceTools.mjs`,
  `scripts/dev/listingRangeTools.mjs`,
  `scripts/dev/binaryMismatchTools.mjs`,
  `scripts/dev/hexFormatTools.mjs`,
  `test/unit/scripts/asm80-reference-tools.test.ts`,
  `test/unit/scripts/binary-mismatch-tools.test.ts`,
  `test/unit/scripts/hex-format-tools.test.ts`)
- Split Z80 parser validation for `in`, `out`, `ex`, `ld`, indexed bit/rotate
  destinations, accumulator ALU forms, `jp`, `call`, and `jr`/`djnz` into
  focused helpers. This removed the remaining Z80 parser high-complexity
  findings from Fallow while keeping current Z80 parser/encoder tests green.
  (complete —
  `src/z80/parse-instruction.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`)
- Added the public `./tooling` package subpath entrypoint to Fallow so
  exported register contracts tooling helpers are analyzed as public API instead of
  false-positive dead exports. This removed `src/register-contracts/tooling.ts` from
  Fallow's active refactoring targets and reduced the reported dead-export
  percentage. (complete — `fallow.toml`, `src/api-tooling.ts`,
  `src/register-contracts/tooling.ts`)
- Split register contracts instruction head and operand register-name helpers into
  separate modules, removing the mixed-purpose `instruction-names.ts` coupling
  point from Fallow's active refactoring targets while preserving existing
  register contracts summary and instruction-shape behavior. (complete —
  `src/register-contracts/instruction-head.ts`,
  `src/register-contracts/operand-register-name.ts`,
  `test/unit/register-contracts/instruction-shape.test.ts`,
  `test/unit/register-contracts/programModel.test.ts`)
- Split register contracts summary state helpers out of `src/register-contracts/summary.ts`. (complete — `src/register-contracts/summary-state.ts`)
- Split `src/syntax/parse-expression.ts` by expression/token/layout parsing
  responsibility and moved token-level Pratt parsing into its own module.
  (complete — `src/syntax/expression-tokenizer.ts`,
  `src/syntax/parse-layout-expression.ts`,
  `src/syntax/parse-token-expression.ts`)
- Split layout-expression bracket matching into quote and depth state helpers,
  removing `findMatchingBracket` from Fallow's high-complexity list while
  preserving quoted layout-cast index parsing. (complete —
  `src/syntax/parse-layout-expression.ts`,
  `test/unit/syntax/pr769-layout-cast-parser.test.ts`)
- Split layout-expression path walking into field/index parsers for layout
  casts and `offset(...)` paths, removing `parseLayoutCastPath` and
  `parseOffsetPath` from Fallow's high-complexity list while preserving layout
  cast and offset traversal semantics. (complete —
  `src/syntax/parse-layout-expression.ts`,
  `test/unit/syntax/pr769-layout-cast-parser.test.ts`,
  `test/integration/minimal-assembler-stage7-layout.test.ts`)
- Split op template instruction instantiation out of the op-expansion registry
  and added direct unit coverage for LD, INC/DEC, branch, ALU, and malformed
  direct forms, removing Fallow's `instantiateTemplateInstruction` finding while
  keeping `src/expansion/op-expansion.ts` below the review trigger.
  (complete — `src/expansion/op-instruction-instantiation.ts`,
  `test/unit/expansion/op-instruction-instantiation.test.ts`)
- Split op local-label rename planning out of the op-expansion coordinator so
  expansion-local labels and expression rewrites are isolated from overload
  collection/dispatch. (complete — `src/expansion/op-local-labels.ts`)
- Split op matcher/operand parsing and constant-fit helpers out of the
  op-expansion coordinator. (complete — `src/expansion/op-operands.ts`)
- Split op overload selection and diagnostics out of the op-expansion
  coordinator, with direct unit coverage for single matches, immediate
  specificity, arity errors, and mismatch diagnostics. This brought
  `src/expansion/op-expansion.ts` below the 500-line review trigger so it no
  longer needs the source-size allowlist. (complete —
  `src/expansion/op-selection.ts`,
  `test/unit/expansion/op-selection.test.ts`)
- Simplified op-local label renaming by splitting source-item and instruction
  expression rewrites into focused helpers, removing the helper module from
  Fallow's active refactoring target list. (complete —
  `src/expansion/op-local-labels.ts`)
- Split op immediate constant fitting and operand-list splitting out of
  matcher/operand parsing, removing `src/expansion/op-operands.ts` from
  Fallow's active refactoring target list. (complete —
  `src/expansion/op-constant-expression.ts`,
  `src/expansion/op-operand-splitting.ts`,
  `src/expansion/op-operands.ts`)
- Table-drove op overload matcher predicates and separated fixed/immediate
  specificity checks, reducing the op-selection high-complexity signal while
  preserving overload diagnostics and direct unit coverage. (complete —
  `src/expansion/op-selection.ts`,
  `test/unit/expansion/op-selection.test.ts`)
- Table-drove op overload mismatch expectation text, removing
  `matcherMismatchReason` from Fallow's high-complexity list while preserving
  fixed-token and matcher diagnostic output. (complete —
  `src/expansion/op-selection.ts`,
  `test/unit/expansion/op-selection.test.ts`)
- Split op overload specificity comparison into vote accumulation and result
  classification helpers, with direct ambiguous-overload coverage, removing
  `compareOverloadSpecificity` from Fallow's high-complexity list. (complete —
  `src/expansion/op-selection.ts`,
  `test/unit/expansion/op-selection.test.ts`)
- Split op body template parsing into candidate-template, operand-list, and
  source-item fallback helpers, preserving the special unsupported-source-line
  suppression for literal op templates while removing the
  `parseOpBodyTemplate` high-complexity entry from Fallow. (complete —
  `src/expansion/op-expansion.ts`)
- Table-drove expression token scanning inside `src/syntax/expression-tokenizer.ts`
  so punctuation, operators, literals, layout terms, numbers, and symbols are
  handled by focused scanners instead of one large loop. (complete —
  `src/syntax/expression-tokenizer.ts`)
- Split quoted-byte expression scanning into value-start validation plus
  escaped and literal byte scanners, removing `scanQuotedByte` from Fallow's
  high-complexity list while preserving single-character quoted byte constants.
  (complete — `src/syntax/expression-tokenizer.ts`,
  `test/integration/stage-4-expressions.test.ts`,
  `test/integration/minimal-assembler-stage7-layout.test.ts`)
- Split layout term scanning into call-head parsing and layout-cast dispatch,
  removing `scanLayoutTerm` from Fallow's high-complexity list while preserving
  lowercase `sizeof(...)`, `offset(...)`, and layout-cast expression parsing.
  (complete —
  `src/syntax/expression-tokenizer.ts`,
  `test/unit/syntax/pr769-layout-cast-parser.test.ts`,
  `test/integration/minimal-assembler-stage7-layout.test.ts`,
  `test/integration/layout-semantics-env-edge-cases.test.ts`,
  `test/integration/native-syntax-cleanup.test.ts`,
  `test/integration/post-release-p1-language.test.ts`)
- Split directive statement parsing out of `src/syntax/parse-line.ts`. (complete — `src/syntax/parse-directive-statement.ts`)
- Split `src/semantics/expression-evaluation.ts` by scalar expression evaluation and layout/offset helpers. (complete — `src/semantics/layout-evaluation.ts`, `src/semantics/layout-format.ts`)
- Split repeated layout path traversal inside `src/semantics/layout-evaluation.ts`
  into focused array-index and record/union field walkers, removing the
  Fallow refactoring target for `layoutCastOffset` and `offsetPath`.
  (complete — `src/semantics/layout-evaluation.ts`)
- Split layout declaration grammar out of `src/core/compile.ts`. (complete —
  `src/syntax/parse-layout-declarations.ts`)
- Split layout field parsing into named-field and scalar directive helpers,
  removing `parseLayoutField` from Fallow's high-complexity list while
  preserving `.field`, `.byte`, `.word`, and `.addr` layout behavior. (complete
  — `src/syntax/parse-layout-declarations.ts`)
- Split directive value-list scanning into escape, quote, and parenthesis state
  helpers, removing `scanValueListChar` from Fallow's high-complexity list while
  preserving `.db`/`.dw`/`.ds` value splitting and quoted-string handling.
  (complete — `src/syntax/parse-directive-statement.ts`,
  `test/integration/minimal-assembler-stage6-directives.test.ts`)
- Shared directive quoted-string content parsing between double-quoted string
  directives and quoted `.db` fragments, removing `parseWholeQuotedString` from
  Fallow's high-complexity list while preserving the stricter `.cstr`/`.pstr`/
  `.istr` double-quote rule. (complete —
  `src/syntax/parse-directive-statement.ts`,
  `test/integration/minimal-assembler-stage6-directives.test.ts`)
- Split `.ds` directive parsing into value-list, size, and fill validators,
  removing `parseDsDirective` from Fallow's high-complexity list while
  preserving `.ds` TypeExpr shorthand, optional fill bytes, and diagnostics.
  (complete — `src/syntax/parse-directive-statement.ts`,
  `test/integration/minimal-assembler-stage7-layout.test.ts`)
- Split `src/outputs/write-asm80.ts` by instruction formatting, expression formatting, and artifact writing. (complete — `src/outputs/asm80-instructions.ts`, `src/outputs/asm80-expressions.ts`, `src/outputs/asm80-strings.ts`)
- Split D8 debug-map writer helpers out of `src/outputs/write-d8.ts`.
  (complete — `src/outputs/d8-helpers.ts`, `src/outputs/d8-files.ts`)
- Split Intel HEX reserved-address segment generation into initialized-bound,
  in-range set, skip-decision, and segment-close helpers, removing
  `toNonReservedSegments` from Fallow's high-complexity list while preserving
  sparse/reserved output behavior. (complete — `src/outputs/hex.ts`,
  `test/unit/outputs/write-hex.test.ts`)
- Simplified D8 symbol sorting helpers to remove Fallow's high-complexity
  finding for `compareSymbol` without changing sort precedence.
  (complete — `src/outputs/d8-helpers.ts`)
- Split public compile API orchestration by artifact emission and register contracts
  setup. (complete — `src/api-artifacts.ts`, `src/api-register-contracts.ts`)
- Split explicit register contract application out of
  `src/register-contracts/summary.ts`. (complete —
  `src/register-contracts/summary-contract.ts`)
- Split register contracts constant collection and program-model boundary discovery
  out of the main summary/model files. (complete —
  `src/register-contracts/constants.ts`, `src/register-contracts/programModel-boundaries.ts`)
- Split register contracts summary result construction out of
  `src/register-contracts/summary.ts`. (complete —
  `src/register-contracts/summary-result.ts`)
- Split register contracts pure token transfer handling into LD copy/production,
  EX swap, operand-unit, and token mutation helpers, removing
  `applyPureTokenTransfer` from Fallow's high-complexity list while preserving
  routine summary value-relation inference. (complete —
  `src/register-contracts/summary-token-transfer.ts`,
  `src/register-contracts/summary.ts`,
  `test/unit/register-contracts/summary.test.ts`)
- Split register contracts effect write handling into ignored-write,
  accumulator-self, tracked-write, and direct-write helpers, removing
  `applyEffectWrites` from Fallow's high-complexity list while preserving
  mechanical residue and intended-output summary behavior. (complete —
  `src/register-contracts/summary.ts`,
  `test/unit/register-contracts/summary.test.ts`)
- Split register contracts boundary summary resolution into call, external
  tail-jump, RST service, and RST fallback helpers, removing `boundarySummary`
  from Fallow's high-complexity list while preserving known JP/RST summary
  inference and local-label exclusions. (complete —
  `src/register-contracts/summary-boundary.ts`,
  `src/register-contracts/summary.ts`,
  `test/integration/register-contracts/integration.test.ts`)
- Split register contracts routine-summary inference into explicit state/context and
  per-instruction step helpers, removing `inferRoutineSummary` from Fallow's
  high-complexity list while preserving routine summary inference and known
  boundary behavior. (complete —
  `src/register-contracts/summary.ts`,
  `src/register-contracts/summary-boundary.ts`,
  `test/unit/register-contracts/summary.test.ts`,
  `test/integration/register-contracts/integration.test.ts`)
- Split register contracts analysis orchestration helpers out of
  `src/register-contracts/analyze.ts`. (complete —
  `src/register-contracts/analyze-helpers.ts`)
- Simplified register contracts instruction shape helpers and smart-comment parsing
  branches to reduce Fallow complexity without changing behavior. (complete —
  `src/register-contracts/instruction-shape.ts`, `src/register-contracts/smartComments.ts`)
- Split register contracts instruction naming, operand selection, and predicate
  helpers into focused modules with direct unit coverage. (complete —
  `src/register-contracts/instruction-names.ts`,
  `src/register-contracts/instruction-operands.ts`,
  `src/register-contracts/instruction-predicates.ts`,
  `test/unit/register-contracts/instruction-shape.test.ts`)
- Added direct register contracts interface contract coverage and split `.asmi`
  interface parsing out of source smart-comment parsing. (complete —
  `test/unit/register-contracts/smartComments.test.ts`,
  `src/register-contracts/interfaceContracts.ts`)
- Split smart-comment line parsing and preceding documentation-block discovery
  out of the routine-contract coordinator, removing Fallow's active
  `src/register-contracts/smartComments.ts` refactoring target while preserving the
  public `parseSmartCommentLine` export. (complete —
  `src/register-contracts/smartCommentParsing.ts`,
  `src/register-contracts/smartCommentBlocks.ts`)
- Split smart-comment carrier construction into named and unnamed contract
  builders, removing `parseCarrierComment` from Fallow's high-complexity list
  while preserving compact source contract and `expects out` parsing. (complete
  — `src/register-contracts/smartCommentParsing.ts`,
  `test/unit/register-contracts/smartComments.test.ts`)
- Split register contracts program model routine construction out of
  `src/register-contracts/programModel.ts`. (complete —
  `src/register-contracts/programModel-routines.ts`)
- Split register contracts global-label routine-boundary handling into entry-label,
  source-boundary, and alias helpers, removing `handleGlobalLabel` from
  Fallow's high-complexity list while preserving entry-label routine grouping.
  (complete — `src/register-contracts/programModel-routines.ts`,
  `test/unit/register-contracts/programModel.test.ts`)
- Split register contracts liveness boundary classification into call, tail-jump,
  and RST target helpers, and isolated accumulator flag-refresh reads, removing
  `boundaryTarget` and `semanticReadsForLiveness` from Fallow's
  high-complexity list while preserving call-clobber, RST dispatcher, and
  flag-derived output behavior. (complete —
  `src/register-contracts/liveness.ts`,
  `test/unit/register-contracts/liveness.test.ts`)
- Split register contracts live-transfer processing into boundary summary,
  accepted-output, write-removal, and semantic-read helpers, removing
  `transferLiveBefore` from Fallow's high-complexity list while preserving
  hinted outputs, intentional summary outputs, and conditional-call liveness.
  (complete — `src/register-contracts/liveness.ts`,
  `test/unit/register-contracts/liveness.test.ts`,
  `test/integration/register-contracts/integration.test.ts`)
- Split register contracts caller-output candidate construction into carrier
  collection and diagnostic object helpers, removing
  `findCallerOutputCandidateObservations` from Fallow's high-complexity list
  while preserving tooling/API output-candidate diagnostics. (complete —
  `src/register-contracts/liveness.ts`,
  `test/integration/register-contracts/tooling.test.ts`,
  `test/integration/stage-14-tooling-api.test.ts`)
- Split register contracts direct tail-jump boundary detection into instruction
  form and target-eligibility helpers, removing `instructionTailJumpTarget`
  from Fallow's high-complexity list while preserving entry-label conditional
  tail-call behavior. (complete —
  `src/register-contracts/programModel-boundaries.ts`,
  `test/unit/register-contracts/programModel.test.ts`)
- Centralized quoted comment scanning for `stripLineComment` and
  `extractLineComment`. (complete — `src/source/strip-line-comment.ts`)
- Added direct edge-case coverage for escaped quotes and apostrophe-suffixed
  register syntax in line-comment scanning, then split scanner state handling
  into explicit helpers. (complete — `test/unit/strip-line-comment.test.ts`,
  `src/source/strip-line-comment.ts`)
- Split line-comment scanner state into a private source helper so
  `stripLineComment`/`extractLineComment` remain a small public API wrapper,
  removing Fallow's active `src/source/strip-line-comment.ts` refactoring target.
  (complete — `src/source/line-comment-scanner.ts`,
  `src/source/strip-line-comment.ts`)
- Added direct register contracts fix-helper coverage and simplified register-pair
  read matching. (complete — `test/unit/register-contracts/fix.test.ts`,
  `src/register-contracts/fix.ts`)
- Split register contracts expect-out continuation traversal into work initialization,
  seen-state filtering, remaining-unit calculation, and read-confirmation
  helpers, removing `continuationReads` from Fallow's high-complexity list while
  preserving auto-fix eligibility for real post-call output reads. (complete —
  `src/register-contracts/fix.ts`,
  `test/unit/register-contracts/fix.test.ts`,
  `test/integration/register-contracts/tooling.test.ts`)
- Split register contracts report rendering into routine, conflict, output-candidate,
  and unknown-call section appenders, removing `renderRegisterContractsReport` from
  Fallow's high-complexity list while preserving deterministic report text.
  (complete —
  `src/register-contracts/report.ts`,
  `test/unit/register-contracts/report.test.ts`,
  `test/integration/register-contracts/tooling.test.ts`)
- Split CLI primary-output validation into register contracts artifact detection and
  output-name helpers, removing `validateEnabledPrimaryOutput` from Fallow's
  high-complexity list while preserving `--type`/`--nohex`/`--nobin`
  diagnostics. (complete —
  `src/cli/parse-args.ts`,
  `test/integration/stage-13-cli.test.ts`,
  `test/cli/cli_artifacts.test.ts`)
- Split register contracts control-flow successor calculation into next-index,
  boundary fallthrough, jump, and return helpers, removing
  `instructionSuccessors` from Fallow's high-complexity list while preserving
  liveness and expect-out traversal behavior. (complete —
  `src/register-contracts/controlFlow.ts`,
  `test/unit/register-contracts/liveness.test.ts`,
  `test/unit/register-contracts/fix.test.ts`,
  `test/integration/register-contracts/tooling.test.ts`)
- Centralized constant unary, binary, and byte-function operators for
  register contracts constant collection and lowered ASM80 expression evaluation,
  removing `evaluateBinaryConstant` from Fallow's high-complexity list while
  preserving divide/modulo-by-zero undefined behavior and `LSB`/`MSB` handling.
  (complete —
  `src/semantics/constant-operators.ts`,
  `src/register-contracts/constants.ts`,
  `src/outputs/asm80-expression-evaluation.ts`,
  `test/unit/outputs/asm80-expressions.test.ts`,
  `test/integration/asm80-conditional-and-byte-functions.test.ts`,
  `test/unit/register-contracts/summary.test.ts`)
- Reused the shared constant-operator helpers in semantic expression evaluation
  while keeping the existing divide-by-zero and modulo-by-zero diagnostics as a
  semantic-layer responsibility, removing `evaluateBinary` from Fallow's
  high-complexity list. (complete —
  `src/semantics/expression-evaluation.ts`,
  `test/integration/stage-4-expressions.test.ts`,
  `test/integration/layout-semantics-env-edge-cases.test.ts`,
  `test/integration/asm80-conditional-and-byte-functions.test.ts`,
  `test/unit/syntax/expression.test.ts`)
- Reused the shared constant-operator helpers in fixup target constant folding,
  removing `constantBinaryExpressionValue` from Fallow's high-complexity list
  while preserving symbolic addend detection and divide/modulo-by-zero
  undefined folding behavior. (complete —
  `src/assembly/fixup-emission.ts`,
  `test/integration/stage-4-fixups.test.ts`,
  `test/integration/stage-4-expressions.test.ts`,
  `test/integration/real-program-parity.test.ts`,
  `test/unit/z80/pr1349-ld-indirect-regression.test.ts`)
- Split fixup target extraction into binary, left-symbol, and right-symbol
  addend helpers, removing `fixupTargetFromExpression` from Fallow's
  high-complexity list while preserving accepted `symbol + constant`,
  `constant + symbol`, and `symbol - constant` forms. (complete —
  `src/assembly/fixup-emission.ts`,
  `test/integration/stage-4-fixups.test.ts`,
  `test/integration/real-program-parity.test.ts`,
  `test/unit/z80/pr1349-ld-indirect-regression.test.ts`)
- Split op declaration collection into header parsing, body collection, and
  overload recording helpers, removing `collectOps` from Fallow's
  high-complexity list while preserving op-line indexing, missing-`end`
  diagnostics, and top-level `.end` stopping behavior. (complete —
  `src/expansion/op-expansion.ts`,
  `test/unit/expansion/op-expansion.test.ts`,
  `test/unit/expansion/op-selection.test.ts`,
  `test/integration/minimal-assembler-stage9-ops.test.ts`,
  `test/integration/register-contracts/opExpansion.integration.test.ts`)
- Moved selected-op expansion execution into a dedicated executor module,
  removing `expandSelectedOp` from Fallow's high-complexity list while
  preserving overload selection diagnostics, recursive expansion cycle
  reporting, op-local label renaming, and invalid expanded-instruction
  diagnostics. (complete —
  `src/expansion/op-expansion.ts`,
  `src/expansion/op-expand-selected.ts`,
  `test/unit/expansion/op-expansion.test.ts`,
  `test/unit/expansion/op-selection.test.ts`,
  `test/integration/minimal-assembler-stage9-ops.test.ts`,
  `test/integration/register-contracts/opExpansion.integration.test.ts`,
  `test/integration/stage-3-visible-op-diagnostics.test.ts`)
- Split Z80 LD support/reason classification out of the main instruction
  parser and table-drove supported form checks, removing `isSupportedLd` and
  `unsupportedLdReason` from Fallow's high-complexity list while preserving LD
  diagnostic and encoding behavior. (complete —
  `src/z80/parse-instruction.ts`,
  `src/z80/ld-support.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/unit/z80/pr203-ld-diag-matrix.test.ts`,
  `test/unit/z80/pr693-ld-form-selection.test.ts`,
  `test/unit/z80/pr1349-ld-indirect-regression.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`,
  `test/integration/pr203-ld-diag-matrix.test.ts`,
  `test/integration/pr240-register-target-diag-matrix.test.ts`)
- Table-drove Z80 LD operand parsing into indexed, indirect, absolute-memory,
  register, special-register, and immediate parsers, removing `parseLdOperand`
  from Fallow's high-complexity list while preserving LD operand diagnostics and
  encoding behavior. (complete —
  `src/z80/parse-instruction.ts`,
  `test/unit/z80/parser-encoder.test.ts`,
  `test/unit/z80/pr203-ld-diag-matrix.test.ts`,
  `test/unit/z80/pr693-ld-form-selection.test.ts`,
  `test/unit/z80/pr1349-ld-indirect-regression.test.ts`,
  `test/integration/minimal-assembler-z80-encoder.test.ts`,
  `test/integration/pr203-ld-diag-matrix.test.ts`,
  `test/integration/pr240-register-target-diag-matrix.test.ts`)
- Split the source-file-size guardrail script into argument handlers,
  allowlist-entry validators, recursive file-walk helpers, line counting,
  breach classification, and report printers, removing the size-guard script
  from Fallow's high-complexity list while preserving source-size guard output.
  (complete —
  `scripts/check-source-file-sizes.mjs`)
- Split the removed-syntax guardrail into path filtering, file traversal,
  markdown-fence scanning, violation construction, and line-rule helpers,
  removing the guardrail's large scanner and helper functions from Fallow's
  high-complexity list while preserving violation reporting behavior.
  (complete —
  `scripts/ci/removed-syntax-guardrail.js`,
  `test/integration/asm-removed-syntax-boundary.test.ts`)
- Split the real-program corpus guardrail into environment setup, output-dir
  setup, per-repository checks, per-entry execution, tool-failure reporting, and
  output cleanup helpers, removing its `main` function from Fallow's
  high-complexity list while preserving skip/pass/fail reporting and preserved
  failure artifacts. (complete —
  `scripts/dev/run-azm-corpus-guardrails.mjs`)
- Split the ASM80 lowering coverage guardrail into fixture discovery, optional
  corpus resolution, diagnostic location formatting, entry checking, and final
  reporting helpers, removing `main`, `collectFixtureFiles`, and
  `formatAsm80Failure` from Fallow's high-complexity list while preserving
  `check:asm80-coverage` pass/fail and optional-source skip output. (complete —
  `scripts/dev/check-asm80-lowering-coverage.mjs`)
- Split the fixture coverage map guardrail into fixture classification, map
  existence/header validation, write-mode update handling, and diff reporting
  helpers, removing its recursive fixture collection finding from Fallow while
  preserving `check:fixture-coverage` output. (complete —
  `scripts/dev/check-fixture-coverage.mjs`)
- Split the docs-fast Prettier changed-path script into path partitioning,
  deleted-path reporting, skip detection, and Prettier invocation helpers,
  removing `scripts/ci/docs-prettier-check.js` from Fallow's high-complexity
  list while preserving docs-only CI behavior. (complete —
  `scripts/ci/docs-prettier-check.js`)
- Split the MON3 binary comparison script into argument parsing, input
  validation, compile execution, diagnostic reporting, reference loading, and
  binary comparison helpers, removing its `main` function from Fallow's
  high-complexity list while preserving help/usage and exit-code behavior.
  (complete — `scripts/dev/compare-mon3-binary.mjs`)
- Split the TEC-1G corpus comparison script into source-file classification,
  argument parsing, environment validation, source partitioning, per-source
  comparison, and corpus reporting helpers, removing both script findings from
  Fallow's high-complexity list while preserving help/usage and exit-code
  behavior. (complete — `scripts/dev/compare-tec1g-corpus.mjs`)
- Centralized quoted-code scanning in the MON3 ASM80 audit script so comment
  stripping, current-location counting, and string-literal counting share the
  same quote-start rule, removing the old `stripComment`, `countOutsideStrings`,
  and `countStringLiterals` Fallow findings while preserving MON3 opcode audit
  output. (complete — `scripts/dev/asm80-mon3-audit.mjs`,
  `test/asm80/mon3_opcode_gap.test.ts`)
- Table-drove MON3 ASM80 audit immediate sampling and split fallback sampling
  into single-purpose helpers, removing `sampleImm` from Fallow's
  high-complexity list while preserving MON3 opcode audit output. (complete —
  `scripts/dev/asm80-mon3-audit.mjs`, `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit logical-line parsing into leading-label stripping,
  directive recognition, and instruction recognition helpers, removing
  `parseLogicalLine` from Fallow's high-complexity list while preserving MON3
  opcode audit output. (complete — `scripts/dev/asm80-mon3-audit.mjs`,
  `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit operand parsing into register, parenthesized memory,
  port, indexed-memory, and immediate helpers, removing `parseOperand` from
  Fallow's high-complexity list while preserving MON3 opcode audit output.
  (complete — `scripts/dev/asm80-mon3-audit.mjs`,
  `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit operand normalization into register, port,
  memory-register, indexed-memory, and immediate-form helpers, removing
  `normalizeOperand` from Fallow's high-complexity list while preserving MON3
  opcode audit output. (complete — `scripts/dev/asm80-mon3-audit.mjs`,
  `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit operand-list scanning into quote, depth, comma-split,
  and operand-finalization helpers, removing `splitOperands` from Fallow's
  high-complexity list while preserving MON3 opcode audit output. (complete —
  `scripts/dev/asm80-mon3-audit.mjs`, `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit file scanning into file registration, per-line metric
  collection, parsed-line dispatch, directive handling, include recursion, and
  instruction-form recording helpers, removing `scanFile` from Fallow's
  high-complexity list while preserving MON3 opcode audit output. (complete —
  `scripts/dev/asm80-mon3-audit.mjs`, `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit unsupported-form detection into build validation,
  dynamic assembler loading, parse diagnostics, encoder diagnostics, and
  unsupported-record construction helpers, removing `unsupportedForms` from
  Fallow's high-complexity list while preserving MON3 opcode audit output.
  (complete — `scripts/dev/asm80-mon3-audit.mjs`,
  `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit text formatting into file, count, unknown-symbol,
  expression-count, and unsupported-form section helpers, removing `formatText`
  from Fallow's high-complexity list while preserving MON3 opcode audit output.
  (complete — `scripts/dev/asm80-mon3-audit.mjs`,
  `test/asm80/mon3_opcode_gap.test.ts`)
- Split MON3 ASM80 audit quote-aware code scanning into per-character,
  quoted-character consumption, and quote-start helpers, removing `scanCode`
  from Fallow's high-complexity list while preserving MON3 opcode audit output.
  (complete — `scripts/dev/asm80-mon3-audit.mjs`,
  `test/asm80/mon3_opcode_gap.test.ts`)
- Split differential run-result comparison into exit-code, diagnostic,
  artifact, optional-artifact, and console-output comparators, removing
  `compareRunResults` from Fallow's high-complexity list while preserving
  existing normalization and artifact comparison policy. (complete —
  `test/differential/compare-results.ts`)
- Split ASM80 parser-test statement shaping into equate, location directive,
  end, raw-data, instruction, and single-item helpers, removing
  `statementShape` from Fallow's high-complexity list while preserving parser
  helper behavior. (complete — `test/unit/syntax/asm80-parse-helpers.ts`,
  `test/unit/syntax/asm80-source-parser.test.ts`,
  `test/unit/syntax/asm-top-level-parser.test.ts`)
- Table-drove directive statement dispatch and extracted value-list scanner
  state. (complete — `src/syntax/parse-directive-statement.ts`)
- Split directive alias profile validation, alias-head validation, reserved-word
  checks, and target normalization out of the main alias-policy builder,
  removing `buildDirectiveAliasPolicy` from Fallow's high-complexity list while
  preserving exact/case-sensitive alias behavior. (complete —
  `src/syntax/directive-aliases.ts`,
  `test/unit/syntax/directive-aliases.test.ts`)
- Split ASM80 LD and zero-operand instruction formatting into narrower helpers,
  reducing the file's concentrated Fallow risk while preserving lowered output.
  (complete — `src/outputs/asm80-instructions.ts`)
- Split lowered ASM80 instruction dispatch into focused formatter groups
  for load/immediate, ALU, bit/rotate, I/O, single-operand, and
  branch/stack/return forms. This removes the large top-level
  `formatInstruction` dispatch from Fallow's high-complexity list while keeping
  lowered text behavior covered by output tests. (complete —
  `src/outputs/asm80-instructions.ts`,
  `test/unit/outputs/asm80-instructions.test.ts`)
- Table-drove lowered ASM80 ALU formatter selection so 16-bit
  `add`/`adc`/`sbc` and accumulator ALU forms are separated by small type
  guards instead of a multi-case switch, removing `formatAluInstruction` from
  Fallow's high-complexity list. (complete —
  `src/outputs/asm80-instructions.ts`,
  `test/unit/outputs/asm80-instructions.test.ts`)
- Added direct lowered ASM80 instruction formatter coverage and moved LD,
  indexed, bit, and rotate/shift operand formatting into a dedicated helper
  module. (complete — `test/unit/outputs/asm80-instructions.test.ts`,
  `src/outputs/asm80-instruction-operands.ts`)
- Added direct ASM80 operand-helper coverage and split LD-specific lowered
  operand formatting out of the bit/rotate operand helper module, removing
  Fallow's target for the operand helper. (complete —
  `test/unit/outputs/asm80-instruction-operands.test.ts`,
  `src/outputs/asm80-ld-operands.ts`)
- Table-drove lowered ASM80 source-item formatting and split item-family
  helpers out of the writer's main switch. (complete —
  `src/outputs/write-asm80.ts`)
- Added direct lowered ASM80 expression coverage and split constant evaluation
  away from string formatting. (complete —
  `test/unit/outputs/asm80-expressions.test.ts`,
  `src/outputs/asm80-expression-evaluation.ts`)
- Split lowered ASM80 expression formatting into constant-first dispatch plus
  small unresolved symbol/type/current/unary/binary formatters, removing
  `formatExpression` from Fallow's high-complexity list while preserving
  lowered expression text and constant evaluation behavior. (complete —
  `src/outputs/asm80-expressions.ts`,
  `test/unit/outputs/asm80-expressions.test.ts`,
  `test/differential/lowered-asm80-artifact.test.ts`)
- Extracted address-state build context and item-family handlers from the
  address planning pass. (complete — `src/assembly/address-planning.ts`)
- Extracted emitted-program context and item-family handlers from the byte
  emission pass. (complete — `src/assembly/program-emission.ts`)
- Keep any future hard-cap source-size allowlist entries temporary, justified,
  and removed once file splits bring the target back below the hard cap.

Exit condition:

- Met. This pass removed active review-trigger warnings from
  `src/core/compile.ts`, `src/assembly/address-planning.ts`,
  `src/z80/effects.ts`, `src/register-contracts/summary.ts`,
  `src/syntax/parse-line.ts`, `src/syntax/parse-expression.ts`,
  `src/semantics/expression-evaluation.ts`,
  `src/semantics/layout-evaluation.ts`, `src/api-compile.ts`,
  `src/outputs/write-asm80.ts`, `src/outputs/write-d8.ts`, and
  `src/source/strip-line-comment.ts`. Fallow no longer reports
  `src/register-contracts/smartComments.ts` or
  `src/source/strip-line-comment.ts` as active refactoring targets. The
  hard-cap source-size allowlist is empty; the remaining `src/z80/encode.ts`
  soft-limit warning is a dense encoder-dispatch module, not an active Fallow
  finding.

### 8. Real-Program Validation

Goal: prove the cutover against real programs after feature-completeness
blockers are closed.

Priority: P1, sequenced after Tasks 3-5.

Status: complete — tetro, pacmo, and MON3 pass byte-for-byte BIN acceptance vs ASM80.
Lowered `.z80` for those programs is covered by `test/asm80/emit_asm80_real_program_acceptance.test.ts`
when sources are present (included in `test:ci:asm80-parity`).

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
- string `.equ` expansion in `.db` (colon `.equ` declarations were later
  removed from native AZM)
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
npm run test:ci:asm80-parity
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
- CLI, package, D8, and lowered `.z80` contracts have evidence-backed
  validation
- quality and architecture docs are trustworthy maps of the live codebase
- real-program validation for tetro, pacmo, and MON3 passes locally
